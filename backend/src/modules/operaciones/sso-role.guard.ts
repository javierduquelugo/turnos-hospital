import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  derivarRolDesdePermisos,
  firmarJwtHmac,
  PayloadTokenSsoIntranet,
  PermisoTurnosSso,
  resolverPermisosSso,
  verificarJwtHmac,
} from './jwt-sso.util';

@Injectable()
export class SsoRoleGuard implements CanActivate {
  private obtenerSecret(): string {
    return (
      process.env.INTRANET_JWT_SECRET ||
      'clave_secreta_compartida_con_intranet_hospitalaria'
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method: string = (req.method || 'GET').toUpperCase();
    const url: string = (req.originalUrl || req.url || '').split('?')[0];

    // 1. Endpoint de intercambio inicial SSO siempre es público
    if (url.endsWith('/intranet/sso-login') || url.endsWith('/health')) {
      return true;
    }

    // 2. Extraer token Bearer si viene en la cabecera
    const authHeader: string | undefined = req.headers?.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';

    let payload: (PayloadTokenSsoIntranet & { empleadoId?: string; nombre?: string }) | null = null;
    let permisos: PermisoTurnosSso[] = [];
    if (token) {
      payload = verificarJwtHmac<PayloadTokenSsoIntranet & { empleadoId?: string; nombre?: string }>(
        token,
        this.obtenerSecret()
      );
      permisos = resolverPermisosSso(payload.rol, payload.permisos as string[] | undefined);
      const rolEfectivo = derivarRolDesdePermisos(permisos, payload.rol);
      req.usuarioSso = {
        ...payload,
        rol: rolEfectivo,
        permisos,
      };

      // Renovación deslizante (Sliding Session): si quedan menos de 2 horas (< 7200s), emitir token renovado por 8h
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === 'number' && payload.exp - now < 7200) {
        const nuevoToken = firmarJwtHmac(
          {
            documento: payload.documento,
            empleadoId: payload.empleadoId,
            nombre: payload.nombre,
            rol: rolEfectivo,
            permisos,
            serviciosCoordinados: payload.serviciosCoordinados,
          },
          this.obtenerSecret(),
          28800
        );
        res.setHeader('x-renewed-token', nuevoToken);
      }
    }

    // 3. Las consultas de lectura (GET) sin token o simulaciones puras sin escritura pasan
    if (
      method === 'GET' ||
      url.endsWith('/cuadrantes/validar-celda') ||
      url.endsWith('/banco-horas-nomina/simular-cierre') ||
      url.endsWith('/permutas/simular')
    ) {
      return true;
    }

    // 4. Toda operación de escritura (POST, PUT, PATCH, DELETE) exige sesión SSO válida
    if (!payload) {
      throw new UnauthorizedException(
        'Sesión SSO requerida o expirada. Ingresa nuevamente desde la Intranet Hospitalaria.'
      );
    }

    const tieneConfigAdmin = permisos.includes('TurnosConfiguracionAdmin');
    const tieneNomina = permisos.includes('TurnosNominaGestionar');
    const tieneEditarCuadrante = permisos.includes('TurnosCuadranteEditar');
    const tieneConsultaGlobal = permisos.includes('TurnosConsultaGlobal');

    // 5. Sin ninguno de los 4 permisos especiales -> Perfil Base Colaborador
    if (!tieneConfigAdmin && !tieneNomina && !tieneEditarCuadrante && !tieneConsultaGlobal) {
      if (method === 'GET' || method === 'HEAD') {
        return true;
      }

      const esAccionPermutaPropia =
        (method === 'POST' && url.endsWith('/api/v1/permutas')) ||
        (method === 'PATCH' &&
          (url.endsWith('/aceptar-par') || url.endsWith('/rechazar-par')));
      const esAccionTiempoAdicionalPropia =
        method === 'POST' && url.endsWith('/api/v1/tiempo-adicional');

      if (!esAccionPermutaPropia && !esAccionTiempoAdicionalPropia) {
        throw new ForbiddenException(
          'Acceso denegado: tu perfil de Colaborador solo está autorizado para solicitar permutas o reportar tiempo adicional propio.'
        );
      }
      return true;
    }

    // 6. Administración Global (empresas, servicios-admin, catálogo de turnos, festivos) exige TurnosConfiguracionAdmin
    if (
      url.includes('/api/v1/empresas') ||
      url.includes('/api/v1/servicios-admin') ||
      url.includes('/api/v1/festivos') ||
      url.includes('/api/v1/liquidacion')
    ) {
      if (!tieneConfigAdmin && !(tieneNomina && url.includes('/api/v1/liquidacion'))) {
        throw new ForbiddenException(
          'Acceso denegado: la administración global de empresas, servicios, turnos y festivos requiere el permiso TurnosConfiguracionAdmin.'
        );
      }
      return true;
    }

    // 7. Cierre y Reapertura de Nómina exige TurnosNominaGestionar (o TurnosConfiguracionAdmin)
    if (
      url.includes('/api/v1/banco-horas-nomina/cerrar') ||
      url.includes('/api/v1/banco-horas-nomina/reabrir')
    ) {
      if (!tieneNomina && !tieneConfigAdmin) {
        throw new ForbiddenException(
          'Acceso denegado: el cierre y reapertura de Nómina requieren el permiso TurnosNominaGestionar.'
        );
      }
      return true;
    }

    if (url.endsWith('/api/v1/cuadrantes/estado')) {
      const nuevoEstado = req.body?.estado;
      const esInicioBorrador = nuevoEstado === 'BORRADOR' && req.body?.iniciarBorrador === true;
      if (nuevoEstado === 'CERRADO_NOMINA' || (nuevoEstado === 'BORRADOR' && !esInicioBorrador)) {
        if (!tieneNomina && !tieneConfigAdmin) {
          throw new ForbiddenException(
            'Acceso denegado: el cierre y reapertura de Nómina están reservados al permiso TurnosNominaGestionar.'
          );
        }
        return true;
      }
      if (!tieneEditarCuadrante && !tieneConfigAdmin && !(tieneNomina && nuevoEstado === 'PUBLICADO')) {
        throw new ForbiddenException(
          'Acceso denegado: publicar o iniciar el cuadrante requiere el permiso TurnosCuadranteEditar.'
        );
      }
    }

    // 8. Acciones propias de colaborador siempre permitidas para cualquier usuario autenticado
    const esAccionPropiaColaborador =
      (method === 'POST' && url.endsWith('/api/v1/permutas')) ||
      (method === 'PATCH' && (url.endsWith('/aceptar-par') || url.endsWith('/rechazar-par'))) ||
      (method === 'POST' && url.endsWith('/api/v1/tiempo-adicional'));

    // 9. Edición de cuadrantes y aprobación de solicitudes exige TurnosCuadranteEditar (o TurnosConfiguracionAdmin)
    const esReaperturaNomina =
      tieneNomina && url.endsWith('/api/v1/cuadrantes/estado') && req.body?.estado === 'PUBLICADO';
    if (!esAccionPropiaColaborador && !esReaperturaNomina && !tieneEditarCuadrante && !tieneConfigAdmin) {
      throw new ForbiddenException(
        'Acceso denegado: tu perfil tiene permiso de consulta/nómina, pero modificar cuadrantes o aprobar solicitudes requiere el permiso TurnosCuadranteEditar.'
      );
    }

    // 10. Para ediciones de cuadrante sin TurnosConfiguracionAdmin (y fuera de cierres/reaperturas de nómina), verificar alcance de serviciosCoordinados
    const esAccionGlobalNomina =
      tieneNomina &&
      (url.endsWith('/api/v1/cuadrantes/estado') ||
        url.includes('/api/v1/banco-horas-nomina') ||
        url.includes('/api/v1/liquidacion'));

    if (!tieneConfigAdmin && !esAccionGlobalNomina && !esAccionPropiaColaborador) {
      const srvIdBody = req.body?.servicioId;
      if (
        srvIdBody &&
        Array.isArray(payload.serviciosCoordinados) &&
        payload.serviciosCoordinados.length > 0 &&
        !payload.serviciosCoordinados.includes(srvIdBody)
      ) {
        throw new ForbiddenException(
          `Acceso denegado: no tienes permisos de coordinación sobre el servicio "${srvIdBody}".`
        );
      }

      const srvDestinoBody = req.body?.servicioDestinoId;
      if (
        srvDestinoBody &&
        (!Array.isArray(payload.serviciosCoordinados) ||
          !payload.serviciosCoordinados.includes(srvDestinoBody))
      ) {
        throw new ForbiddenException(
          `Acceso denegado: no tienes permisos de coordinación sobre el servicio destino "${srvDestinoBody}".`
        );
      }
    }

    return true;
  }
}
