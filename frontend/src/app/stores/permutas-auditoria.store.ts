import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, Observable, of, Subject, switchMap } from 'rxjs';
import {
  CeldaAsignacion,
  CodigoTurno,
  PermutaItem,
  RegistroAuditoria,
  SolicitudTiempoAdicionalItem,
} from '../models';
import { TurnosApiService } from '../turnos-api.service';
import {
  calcularDescansoEntreTurnosMin,
  DESCANSO_MINIMO_ENTRE_TURNOS_MIN,
  esCodigoExoneracionContrato,
  r2,
} from '../shared/liquidacion-horas';
import { CatalogosSsoStore } from './catalogos-sso.store';
import { CuadranteStore } from './cuadrante.store';
import { NotificacionStore } from './notificacion.store';

@Injectable({ providedIn: 'root' })
export class PermutasAuditoriaStore {
  private readonly api = inject(TurnosApiService);
  private readonly notificacion = inject(NotificacionStore);
  private readonly catalogos = inject(CatalogosSsoStore);
  private readonly cuadrante = inject(CuadranteStore);

  readonly listaPermutas = signal<PermutaItem[]>([]);
  readonly listaSolicitudesTiempoAdicional = signal<SolicitudTiempoAdicionalItem[]>([]);
  readonly bitacoraAuditoria = signal<RegistroAuditoria[]>([]);

  private readonly auditoriaFiltroSubject = new Subject<{
    servicioId?: string;
    tipoAccion?: string;
    fechaInicio?: string;
    fechaFin?: string;
    incluirBorrador?: boolean;
  }>();

  // Permutas visibles en la vista de Solicitudes según el rol y servicio activo
  readonly permutasVisiblesDashboard = computed<PermutaItem[]>(() => {
    const todas = this.listaPermutas();
    const sesion = this.catalogos.sesionActual();
    const srvActivo = this.catalogos.servicioSeleccionadoId();

    if (this.catalogos.esColaborador() && sesion) {
      return todas.filter(
        (p) => p.solicitanteId === sesion.empleadoId || p.receptorId === sesion.empleadoId
      );
    }

    if (sesion && !this.catalogos.puedeConsultaGlobal() && sesion.rol === 'COORDINADOR') {
      const permitidos = new Set(this.catalogos.serviciosVisibles().map((s) => s.id));
      return todas.filter((p) => p.servicioId === srvActivo && permitidos.has(p.servicioId));
    }

    return todas.filter((p) => !srvActivo || p.servicioId === srvActivo);
  });

  // Solicitudes de Tiempo Adicional (Horas Extras y Llamados DISP) visibles según rol y servicio
  readonly solicitudesTiempoAdicionalVisiblesDashboard = computed<SolicitudTiempoAdicionalItem[]>(() => {
    const todas = this.listaSolicitudesTiempoAdicional();
    const sesion = this.catalogos.sesionActual();
    const srvActivo = this.catalogos.servicioSeleccionadoId();

    if (this.catalogos.esColaborador() && sesion) {
      return todas.filter((s) => s.empleadoId === sesion.empleadoId);
    }

    if (sesion && !this.catalogos.puedeConsultaGlobal() && sesion.rol === 'COORDINADOR') {
      const permitidos = new Set(this.catalogos.serviciosVisibles().map((s) => s.id));
      return todas.filter((s) => s.servicioId === srvActivo && permitidos.has(s.servicioId));
    }

    return todas.filter((s) => !srvActivo || s.servicioId === srvActivo);
  });

  // Notificaciones dinámicas de Solicitudes según el rol (Badge numérico en el menú lateral)
  readonly notificacionesSolicitudesCount = computed<number>(() => {
    const sesion = this.catalogos.sesionActual();
    if (!sesion) {
      return 0;
    }
    if (this.catalogos.esColaborador()) {
      return this.listaPermutas().filter(
        (p) => p.receptorId === sesion.empleadoId && p.estado === 'PENDIENTE_PAR'
      ).length;
    }
    if (!this.catalogos.puedeEditarCuadrante()) {
      return 0;
    }
    const permPendientes = this.permutasVisiblesDashboard().filter(
      (p) => p.estado === 'PENDIENTE_SUPERVISOR'
    ).length;
    const tiempoPendientes = this.solicitudesTiempoAdicionalVisiblesDashboard().filter(
      (s) => s.estado === 'PENDIENTE_SUPERVISOR'
    ).length;
    return permPendientes + tiempoPendientes;
  });

  constructor() {
    this.auditoriaFiltroSubject
      .pipe(
        switchMap((filtros) => this.crearObsAuditorias(filtros)),
        takeUntilDestroyed()
      )
      .subscribe();

    this.cuadrante.cuadranteEditadoPublicado$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.sincronizarAuditoriasDesdePostgres();
      });
  }

  crearObsAuditorias(filtros?: {
    servicioId?: string;
    tipoAccion?: string;
    fechaInicio?: string;
    fechaFin?: string;
    incluirBorrador?: boolean;
  }): Observable<RegistroAuditoria[]> {
    const permitidosInit = new Set([
      ...this.catalogos.serviciosVisibles().map((s) => s.id),
      ...(this.catalogos.sesionActual()?.serviciosPermitidosIds || []),
    ]);
    const esGlobal = this.catalogos.esAdminTh() || this.catalogos.puedeConsultaGlobal();
    let srvId =
      filtros?.servicioId !== undefined
        ? filtros.servicioId
        : esGlobal
          ? 'TODOS'
          : this.catalogos.servicioSeleccionadoId();

    if (!esGlobal && srvId === 'TODOS' && permitidosInit.size === 1) {
      srvId = Array.from(permitidosInit)[0];
    }

    return this.api
      .obtenerAuditorias(
        srvId,
        500,
        filtros?.tipoAccion,
        filtros?.fechaInicio,
        filtros?.fechaFin,
        undefined,
        Boolean(filtros?.incluirBorrador)
      )
      .pipe(
        map((logs) => {
          const lista = Array.isArray(logs) ? logs : [];
          const permitidosActual = new Set([
            ...this.catalogos.serviciosVisibles().map((s) => s.id),
            ...(this.catalogos.sesionActual()?.serviciosPermitidosIds || []),
          ]);
          const tieneGlobalActual = this.catalogos.esAdminTh() || this.catalogos.puedeConsultaGlobal();
          const filtrados =
            tieneGlobalActual || permitidosActual.size === 0
              ? lista
              : lista.filter((l) => Boolean(l.servicioId && permitidosActual.has(l.servicioId)));
          this.bitacoraAuditoria.set(filtrados);
          try {
            localStorage.removeItem('rafa_turnos_auditoria');
          } catch {}
          return filtrados;
        }),
        catchError(() => of([]))
      );
  }

  sincronizarAuditoriasDesdePostgres(
    filtroSrv?:
      | string
      | {
          servicioId?: string;
          tipoAccion?: string;
          fechaInicio?: string;
          fechaFin?: string;
          incluirBorrador?: boolean;
        }
  ): void {
    const filtrosObj =
      typeof filtroSrv === 'string'
        ? { servicioId: filtroSrv }
        : filtroSrv || {};
    this.auditoriaFiltroSubject.next(filtrosObj);
  }

  sincronizarPermutasDesdePostgres(): void {
    this.api.getPermutas().subscribe({
      next: (permutasDb) => {
        if (Array.isArray(permutasDb)) {
          this.listaPermutas.set(permutasDb);
          try {
            localStorage.removeItem('rafa_turnos_permutas');
          } catch {}
        }
      },
      error: () => {},
    });
    this.sincronizarTiempoAdicionalDesdePostgres();
  }

  sincronizarTiempoAdicionalDesdePostgres(): void {
    if (typeof this.api.getSolicitudesTiempoAdicional !== 'function') return;
    this.api.getSolicitudesTiempoAdicional().subscribe({
      next: (solicitudesDb) => {
        if (Array.isArray(solicitudesDb)) {
          this.listaSolicitudesTiempoAdicional.set(solicitudesDb);
        }
      },
      error: () => {},
    });
  }

  validarReglasPermuta(
    emp1Id: string,
    emp2Id: string,
    dia: number,
    turno1: string,
    turno2: string,
    contexto?: {
      anio: number;
      mes: number;
      matriz: Record<string, Record<number, CeldaAsignacion>>;
      totalDias: number;
      servicioId?: string;
    }
  ): { valida: boolean; motivo: string } {
    const emp1 = this.catalogos.empleados().find((e) => e.id === emp1Id);
    const emp2 = this.catalogos.empleados().find((e) => e.id === emp2Id);
    if (!emp1 || !emp2) {
      return { valida: false, motivo: 'Colaborador no encontrado en la plantilla.' };
    }

    const srvId = contexto?.servicioId || this.catalogos.servicioSeleccionadoId();
    const srv =
      this.catalogos.servicios().find((s) => s.id === srvId) || this.catalogos.servicioActual();

    const mismoCargoId = Boolean(emp1.categoriaId && emp2.categoriaId && emp1.categoriaId === emp2.categoriaId);
    const mismoCargoNombre = emp1.categoria.trim().toLowerCase() === emp2.categoria.trim().toLowerCase();
    const mismoCargo = mismoCargoId || mismoCargoNombre;

    const cargoPermitidoEnSrv = (emp: { categoriaId?: string; categoria: string }): boolean => {
      const ids =
        srv?.cargosPermitidosIds && srv.cargosPermitidosIds.length > 0
          ? srv.cargosPermitidosIds
          : (srv?.cargosPermitidos || []).map((c) => c.categoriaId).filter(Boolean);
      const nombres = (srv?.cargosPermitidos || [])
        .map((c) => c.categoriaNombre?.trim().toLowerCase())
        .filter(Boolean);
      if (emp.categoriaId && ids.includes(emp.categoriaId)) return true;
      if (emp.categoria && nombres.includes(emp.categoria.trim().toLowerCase())) return true;
      return false;
    };

    const permutaEntreCargosHabilitada =
      Boolean(srv?.permitePermutaEntreCargos) && cargoPermitidoEnSrv(emp1) && cargoPermitidoEnSrv(emp2);

    if (!mismoCargo && !permutaEntreCargosHabilitada) {
      return {
        valida: false,
        motivo: `RN-05 Incompatibilidad: ${emp1.nombre} (${emp1.categoria}) no puede permutar con ${emp2.nombre} (${emp2.categoria}).`,
      };
    }

    const catalogo = this.catalogos.catalogoTurnosMap();
    const codT1 = (turno1 || '').trim().toUpperCase();
    const codT2 = (turno2 || '').trim().toUpperCase();
    const cfgT1 = catalogo[codT1];
    const cfgT2 = catalogo[codT2];
    const esAus1 = cfgT1 ? Boolean(cfgT1.esAusencia) : esCodigoExoneracionContrato(codT1);
    const esAus2 = cfgT2 ? Boolean(cfgT2.esAusencia) : esCodigoExoneracionContrato(codT2);

    if (esAus1 || esAus2) {
      return {
        valida: false,
        motivo: 'No se permiten permutas sobre periodos con Novedades Oficiales de RRHH (Vacaciones, Incapacidades, Licencias o Día de la Familia).',
      };
    }

    if (cfgT1?.bloqueaPermutas || cfgT2?.bloqueaPermutas) {
      return {
        valida: false,
        motivo: `El turno (${cfgT1?.bloqueaPermutas ? codT1 : codT2}) tiene bloqueo de permutas habilitado en el catálogo.`,
      };
    }

    if (codT1 === codT2) {
      return {
        valida: false,
        motivo: `Ambos colaboradores ya tienen el mismo turno (${turno1}) en el día ${dia}.`,
      };
    }

    const anioCtx = contexto?.anio ?? this.catalogos.anioSeleccionado();
    const mesCtx = contexto?.mes ?? this.catalogos.mesSeleccionado();
    const map = contexto?.matriz ?? this.cuadrante.asignaciones();
    const totalDias = contexto?.totalDias ?? this.cuadrante.diasDelMes().length;

    if (map[emp1Id]?.[dia]?.fijada || map[emp2Id]?.[dia]?.fijada) {
      return {
        valida: false,
        motivo: `📌 Celda fijada por coordinación en el día ${dia}. No se permiten permutas mientras permanezca protegida.`,
      };
    }

    // 1. Simular descanso para Solicitante (emp1) al recibir turno2:
    const codPrev1 =
      dia === 1
        ? this.cuadrante.obtenerUltimoTurnoMesPrevioEnPeriodo(emp1Id, anioCtx, mesCtx, emp1.ultimoTurnoMesPrevio || 'L')
        : map[emp1Id]?.[dia - 1]?.codigo || '';
    const cfgPrev1 = catalogo[codPrev1];
    const descPrev1Min = calcularDescansoEntreTurnosMin(cfgPrev1, cfgT2);
    if (
      (cfgPrev1?.esNocturnoPesado && cfgT2 && cfgT2.horasOrdinarias > 0 && turno2 !== 'S' && turno2 !== 'L') ||
      (descPrev1Min !== null && descPrev1Min < DESCANSO_MINIMO_ENTRE_TURNOS_MIN)
    ) {
      return {
        valida: false,
        motivo: `Infracción CST Art. 160 para ${emp1.nombre}: Tu turno del día anterior (${codPrev1}) y el nuevo turno (${turno2}) dejan menos de 12h de descanso legal.`,
      };
    }
    if (dia < totalDias) {
      const codSig1 = map[emp1Id]?.[dia + 1]?.codigo || '';
      const cfgSig1 = catalogo[codSig1];
      const descSig1Min = calcularDescansoEntreTurnosMin(cfgT2, cfgSig1);
      if (
        (cfgT2?.esNocturnoPesado && cfgSig1 && cfgSig1.horasOrdinarias > 0 && codSig1 !== 'S' && codSig1 !== 'L') ||
        (descSig1Min !== null && descSig1Min < DESCANSO_MINIMO_ENTRE_TURNOS_MIN)
      ) {
        return {
          valida: false,
          motivo: `Infracción CST Art. 160 para ${emp1.nombre}: El nuevo turno (${turno2}) y tu turno siguiente (${codSig1}) dejan menos de 12h de descanso legal obligatorias.`,
        };
      }
    }

    // 2. Simular descanso para Receptor (emp2) al recibir turno1:
    const codPrev2 =
      dia === 1
        ? this.cuadrante.obtenerUltimoTurnoMesPrevioEnPeriodo(emp2Id, anioCtx, mesCtx, emp2.ultimoTurnoMesPrevio || 'L')
        : map[emp2Id]?.[dia - 1]?.codigo || '';
    const cfgPrev2 = catalogo[codPrev2];
    const descPrev2Min = calcularDescansoEntreTurnosMin(cfgPrev2, cfgT1);
    if (
      (cfgPrev2?.esNocturnoPesado && cfgT1 && cfgT1.horasOrdinarias > 0 && turno1 !== 'S' && turno1 !== 'L') ||
      (descPrev2Min !== null && descPrev2Min < DESCANSO_MINIMO_ENTRE_TURNOS_MIN)
    ) {
      return {
        valida: false,
        motivo: `Infracción CST Art. 160 para ${emp2.nombre}: Su turno del día anterior (${codPrev2}) y el turno que recibiría (${turno1}) dejan menos de 12h de descanso legal.`,
      };
    }
    if (dia < totalDias) {
      const codSig2 = map[emp2Id]?.[dia + 1]?.codigo || '';
      const cfgSig2 = catalogo[codSig2];
      const descSig2Min = calcularDescansoEntreTurnosMin(cfgT1, cfgSig2);
      if (
        (cfgT1?.esNocturnoPesado && cfgSig2 && cfgSig2.horasOrdinarias > 0 && codSig2 !== 'S' && codSig2 !== 'L') ||
        (descSig2Min !== null && descSig2Min < DESCANSO_MINIMO_ENTRE_TURNOS_MIN)
      ) {
        return {
          valida: false,
          motivo: `Infracción CST Art. 160 para ${emp2.nombre}: Recibiría (${turno1}) y su turno siguiente (${codSig2}) dejaría menos de 12h de descanso legal.`,
        };
      }
    }

    const detalleCargo = mismoCargo
      ? `Mismo cargo profesional (${emp1.categoria})`
      : `Cargos equivalentes habilitados en ${srv?.nombre || 'el servicio'} (${emp1.categoria} ↔ ${emp2.categoria})`;
    return {
      valida: true,
      motivo: `${detalleCargo} y descanso mínimo de 12h verificado para ambos.`,
    };
  }

  crearPermutaDesdePortal(
    dto: {
      solicitanteId: string;
      receptorId: string;
      servicioId: string;
      anio: number;
      mes: number;
      diaOrigen: number;
      turnoOrigen: string;
      diaDestino: number;
      turnoDestino: string;
      validacionReglas?: string;
    },
    nombreReceptor: string
  ): void {
    this.api.crearPermuta(dto).subscribe({
      next: (permutaCreada) => {
        this.listaPermutas.set([permutaCreada, ...this.listaPermutas()]);
        this.notificacion.mostrar(
          `📩 Propuesta enviada a ${nombreReceptor}. Esperando su aceptación (Paso 1 de 2).`
        );
      },
      error: (err) => {
        const msg = err?.error?.message || 'No fue posible conectar con el servidor.';
        this.notificacion.mostrar(`⛔ No se pudo enviar la propuesta: ${msg}`);
      },
    });
  }

  aceptarPropuestaPar(idPermuta: string): void {
    this.api.aceptarPermutaPar(idPermuta).subscribe({
      next: () => {
        this.listaPermutas.set(
          this.listaPermutas().map((p) => (p.id === idPermuta ? { ...p, estado: 'PENDIENTE_SUPERVISOR' } : p))
        );
        this.notificacion.mostrar('✅ Has aceptado la propuesta. Fue enviada a la Supervisora para su visto bueno final.');
      },
      error: (err) => {
        const msg = err?.error?.message || 'No fue posible aceptar la propuesta en el servidor.';
        this.notificacion.mostrar(`⛔ ${msg}`);
        this.sincronizarPermutasDesdePostgres();
      },
    });
  }

  rechazarPropuestaPar(data: string | { id: string; motivo?: string }): void {
    const idPermuta = typeof data === 'string' ? data : data.id;
    const motivo = (typeof data === 'object' && data.motivo?.trim())
      ? data.motivo.trim()
      : 'Declinada por el compañero receptor';
    this.api.rechazarPermutaPar(idPermuta, motivo).subscribe({
      next: () => {
        this.listaPermutas.set(
          this.listaPermutas().map((p) =>
            p.id === idPermuta ? { ...p, estado: 'RECHAZADA', motivoRechazo: motivo } : p
          )
        );
        this.notificacion.mostrar('ℹ️ Has declinado la propuesta de intercambio de turno.');
      },
      error: (err) => {
        const msg = err?.error?.message || 'No fue posible declinar la propuesta en el servidor.';
        this.notificacion.mostrar(`⛔ ${msg}`);
        this.sincronizarPermutasDesdePostgres();
      },
    });
  }

  aprobarPermuta(idPermuta: string): void {
    if (!this.catalogos.puedeEditarCuadrante()) return;
    const perm = this.listaPermutas().find((p) => p.id === idPermuta);
    if (!perm) return;

    this.api.aprobarPermuta(idPermuta).subscribe({
      next: (res: {
        cambiosAplicados?: { empleadoId: string; anio: number; mes: number; dia: number; codigo: string }[];
      }) => {
        const cambios = res?.cambiosAplicados || [];
        if (cambios.length > 0) {
          this.cuadrante.asignacionesPorPeriodo.update((todo) => {
            const copia = { ...todo };
            for (const c of cambios) {
              const key = `${c.anio}-${c.mes}`;
              const mapaPeriodo = { ...(copia[key] || {}) };
              const fila = { ...(mapaPeriodo[c.empleadoId] || {}) };
              const anterior = fila[c.dia];
              const cfgNuevo = this.catalogos.catalogoTurnosMap()[c.codigo];
              const conservaBreak = Boolean(cfgNuevo?.recesoHabilitado && !cfgNuevo?.esAusencia);
              const {
                breakTandaOrden: _oldOrd,
                breakInicio: _oldIni,
                breakFin: _oldFin,
                ...restoAnt
              } = anterior || ({} as CeldaAsignacion);
              fila[c.dia] = {
                ...restoAnt,
                codigo: c.codigo as CodigoTurno,
                previsto: anterior?.previsto ?? anterior?.codigo ?? '',
                servicioEjecutorId: perm.servicioId,
                ...(conservaBreak && anterior?.breakInicio && anterior?.breakFin
                  ? {
                      breakTandaOrden: anterior.breakTandaOrden,
                      breakInicio: anterior.breakInicio,
                      breakFin: anterior.breakFin,
                    }
                  : {}),
              };
              mapaPeriodo[c.empleadoId] = fila;
              copia[key] = mapaPeriodo;
            }
            return copia;
          });
        }

        this.listaPermutas.set(
          this.listaPermutas().map((p) => (p.id === idPermuta ? { ...p, estado: 'APROBADA' } : p))
        );

        this.sincronizarAuditoriasDesdePostgres();

        this.notificacion.mostrar('✅ Cambio de turno aprobado por Supervisión y actualizado en el cuadrante.');
      },
      error: (err) => {
        const msg = err?.error?.message || 'No fue posible conectar con el servidor.';
        this.notificacion.mostrar(`⛔ No se aprobó la permuta: ${msg}`);
      },
    });
  }

  rechazarPermuta(data: string | { id: string; motivo?: string }): void {
    if (!this.catalogos.puedeEditarCuadrante()) return;
    const idPermuta = typeof data === 'string' ? data : data.id;
    const motivo = (typeof data === 'object' && data.motivo?.trim())
      ? data.motivo.trim()
      : 'Rechazada por la supervisora asistencial';
    this.api.rechazarPermuta(idPermuta, motivo).subscribe({
      next: () => {
        this.listaPermutas.set(
          this.listaPermutas().map((p) =>
            p.id === idPermuta ? { ...p, estado: 'RECHAZADA', motivoRechazo: motivo } : p
          )
        );
        this.notificacion.mostrar('ℹ️ Solicitud de cambio de turno rechazada por supervisión.');
      },
      error: (err) => {
        const msg = err?.error?.message || 'No fue posible rechazar la solicitud en el servidor.';
        this.notificacion.mostrar(`⛔ ${msg}`);
        this.sincronizarPermutasDesdePostgres();
      },
    });
  }

  crearSolicitudTiempoAdicionalDesdePortal(
    dto: {
      empleadoId: string;
      servicioId: string;
      anio: number;
      mes: number;
      dia: number;
      turnoBase?: string;
      tipo?: 'HORA_EXTRA_PROLONGACION' | 'DISPONIBILIDAD_LLAMADO' | 'GUARDIA_EXTRAORDINARIA';
      horaInicio: string;
      horaFin: string;
      motivoCategoria: string;
      motivoDetalle: string;
      soporteClinico?: string;
    },
    onExito?: () => void
  ): void {
    this.api.crearSolicitudTiempoAdicional(dto).subscribe({
      next: (creada) => {
        this.listaSolicitudesTiempoAdicional.set([
          creada,
          ...this.listaSolicitudesTiempoAdicional(),
        ]);

        const key = `${creada.anio}-${creada.mes}`;
        this.cuadrante.asignacionesPorPeriodo.update((todo) => {
          const copia = { ...todo };
          const mapaPeriodo = { ...(copia[key] || {}) };
          const fila = { ...(mapaPeriodo[creada.empleadoId] || {}) };
          const anterior = fila[creada.dia] || { codigo: (creada.turnoBase || 'L') as CodigoTurno };
          fila[creada.dia] = {
            ...anterior,
            solicitudesPendientesCount: (anterior.solicitudesPendientesCount || 0) + 1,
          };
          mapaPeriodo[creada.empleadoId] = fila;
          copia[key] = mapaPeriodo;
          return copia;
        });

        this.notificacion.mostrar(
          `⏰ Reporte de +${creada.horasCalculadas}h (${creada.horaInicio}–${creada.horaFin}) enviado a Supervisión para validación.`
        );
        if (onExito) onExito();
      },
      error: (err) => {
        const msg = err?.error?.message || 'No fue posible registrar el tiempo adicional.';
        this.notificacion.mostrar(`⛔ ${msg}`);
      },
    });
  }

  resolverSolicitudTiempoAdicional(
    id: string,
    dto: {
      accion: 'APROBAR' | 'RECHAZAR';
      horasAprobadas?: number;
      observacionSupervisor?: string;
      motivoRechazo?: string;
    }
  ): void {
    if (!this.catalogos.puedeEditarCuadrante()) return;
    this.api.resolverSolicitudTiempoAdicional(id, dto).subscribe({
      next: (resuelta) => {
        this.listaSolicitudesTiempoAdicional.set(
          this.listaSolicitudesTiempoAdicional().map((s) => (s.id === id ? resuelta : s))
        );

        const key = `${resuelta.anio}-${resuelta.mes}`;
        this.cuadrante.asignacionesPorPeriodo.update((todo) => {
          const copia = { ...todo };
          const mapaPeriodo = { ...(copia[key] || {}) };
          const fila = { ...(mapaPeriodo[resuelta.empleadoId] || {}) };
          const anterior = fila[resuelta.dia] || {
            codigo: (resuelta.turnoBase || 'L') as CodigoTurno,
          };
          const pendientesRest = Math.max(0, (anterior.solicitudesPendientesCount || 1) - 1);

          if (resuelta.estado === 'APROBADA') {
            const hEff = r2(Number(resuelta.horasAprobadas ?? resuelta.horasCalculadas) || 0);
            const tramosPrev = Array.isArray(anterior.tramosAdicionales)
              ? anterior.tramosAdicionales.filter((t) => t.id !== resuelta.id)
              : [];
            tramosPrev.push({
              id: resuelta.id,
              tipo: resuelta.tipo,
              horaInicio: resuelta.horaInicio,
              horaFin: resuelta.horaFin,
              horasAprobadas: hEff,
              hod: Number(resuelta.hod) || 0,
              hon: Number(resuelta.hon) || 0,
              hdfd: Number(resuelta.hdfd) || 0,
              hdfn: Number(resuelta.hdfn) || 0,
              motivoCategoria: resuelta.motivoCategoria,
              motivoDetalle: resuelta.motivoDetalle,
            });
            const totalAdic = r2(
              tramosPrev.reduce((acc, t) => acc + (Number(t.horasAprobadas) || 0), 0)
            );
            fila[resuelta.dia] = {
              ...anterior,
              horasAdicionalesAprobadas: totalAdic,
              tramosAdicionales: tramosPrev,
              solicitudesPendientesCount: pendientesRest,
            };
          } else {
            fila[resuelta.dia] = {
              ...anterior,
              solicitudesPendientesCount: pendientesRest,
            };
          }

          mapaPeriodo[resuelta.empleadoId] = fila;
          copia[key] = mapaPeriodo;
          return copia;
        });

        this.sincronizarAuditoriasDesdePostgres();

        if (resuelta.estado === 'APROBADA') {
          const hEff = resuelta.horasAprobadas ?? resuelta.horasCalculadas;
          this.notificacion.mostrar(
            `✅ Tiempo adicional aprobado (+${hEff}h ⚡) para ${resuelta.empleadoNombre} y aplicado al acumulado mensual.`
          );
        } else {
          this.notificacion.mostrar(
            `ℹ️ Solicitud de tiempo adicional de ${resuelta.empleadoNombre} rechazada.`
          );
        }
      },
      error: (err) => {
        const msg = err?.error?.message || 'No fue posible procesar la solicitud en el servidor.';
        this.notificacion.mostrar(`⛔ ${msg}`);
        this.sincronizarTiempoAdicionalDesdePostgres();
      },
    });
  }
}
