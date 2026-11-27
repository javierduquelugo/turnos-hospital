# 15. Puntos de Análisis Pendientes y Definiciones Abiertas

Para garantizar una cobertura al 100% antes de iniciar la construcción técnica, se identifican los siguientes aspectos de negocio, integración y gobernanza hospitalaria que requieren definición o parametrización:

---

## 1. Puntos de Negocio y Operación Asistencial

### Punto A: Personal "Flotante" o Préstamos entre Dependencias (Correturnos) - ACTIVO
- **Escenario**: Personal que cubre huecos en distintas dependencias según la necesidad.
- **Definición acordada**:
  - La validación de descansos obligatorios (mínimo 12h) y el tope de horas semanales se aplica de forma **global por persona**.
  - Si un profesional ya está programado en Urgencias en un turno, el sistema bloquea su asignación simultánea o conflictiva en UCI o Cirugía.

### Punto B: Modalidades de Contratación (Planta vs. OPS) - DESESTIMADO PARA EL MVP
- **Decisión del usuario**: **No va por el momento**.
- **Impacto**: Se asume un modelo unificado de personal asistencial. Todo el personal programado se gestiona bajo el mismo catálogo de turnos y se reporta en el consolidado estándar de horas y recargos sin bifurcaciones contractuales complejas en la primera versión.

### Punto C: Restricciones Médicas de Salud Ocupacional (SST / ARL) - DESESTIMADO PARA EL MVP
- **Decisión del usuario**: **No va por el momento**.
- **Impacto**: No se incluirán en el MVP reglas de bloqueo de turnos prohibidos por concepto de medicina laboral ni reducciones médicas de jornada, simplificando la matriz de validaciones al núcleo clínico estándar (12h de descanso, post-guardia y coberturas mínimas).

---

## 2. Puntos de Integración Técnica y Formatos

### Punto D: Mapeo Físico de la Plantilla Excel de Thurni
- **Estado**: Se tiene clara la lógica conceptual (Resumen por Conceptos de Recargo + Matriz Extendida Día 1..31).
- **Pendiente**:
  - Analizar el archivo real `.xlsx` generado actualmente por Thurni en la institución para homologar:
    - Encabezados exactos requeridos por el software de nómina.
    - Orden de columnas y formato de celdas (ej. si requiere horas en formato decimal `7.5` o sexagesimal `07:30`).
    - Nombres o códigos de los centros de costo/servicios.

### Punto E: Endpoints Específicos y Contrato de la API de la Intranet
- **Estado**: Se definió que la Intranet es la fuente de la verdad para empleados y servicios vía REST + SSO con JWT.
- **Pendiente**:
  - Conocer las firmas reales de los endpoints de la Intranet:
    - ¿Qué campos exactos entrega `GET /empleados`? (Cédula, Nombres, Apellidos, Correo, TipoContrato, IdDependencia).
    - ¿Cómo valida el token JWT el backend de la Intranet? (¿Clave secreta compartida `HMAC-SHA256` o endpoint de verificación `/auth/verify`?).

### Punto F: Calendario de Festivos de Colombia (Ley Emiliani) - RESUELTO
- **Decisión acordada**: **Modelo Híbrido Resiliente (Algoritmo Propio + Persistencia PostgreSQL + Caché RAM)**.
- **Implementación**:
  - Algoritmo interno en NestJS (~45 líneas) con cálculo de Pascua (Butcher/Meeus) y Ley 51 de 1983 (Ley Emiliani), sin dependencias externas ni APIs vulnerables.
  - Persistencia en tabla `festivos_colombia` para soportar días cívicos y decretos extraordinarios manuales.
  - Precarga automática en memoria RAM en el arranque del servidor (`onApplicationBootstrap`), garantizando consultas $O(1)$ sin sobrecargar la base de datos y total resiliencia ante reinicios.
  - Documentado a detalle en `docs/analisis/19_gestion_festivos_colombia_y_cache.md`.

---

## 3. Puntos de Gobernanza y Plazos Administrativos (SLA)

### Punto G: Política de Tiempos y Deadlines de Cuadrantes
- **Escenario**: Para garantizar la previsibilidad laboral del personal:
  - ¿Con cuántos días de anticipación antes de fin de mes debe quedar publicado el cuadrante del mes siguiente? (ej. el día 20 o 25 del mes anterior).
  - ¿Existe un plazo límite para que los colaboradores soliciten permutas de turno? (ej. mínimo 24 o 48 horas antes de la ejecución del turno).

### Punto H: Flujo de Aprobación de Guardias Médicas Especiales (`DISP`) - IMPLEMENTADO (CON MEJORAS 2-4 EN REVISIÓN)
- **Escenario**: En servicios médicos críticos y de apoyo, un profesional o técnico realiza disponibilidad no presencial (llamada / retén domiciliario `DISP`).
- **Estado actual implementado**:
  - Turno oficial `DISP` (`0h` presenciales base) habilitado en catálogo y paleta.
  - Reporte de llamados efectivos por el colaborador con validación uninivel del Coordinador, liquidación de recargos normales + suma de hora ordinaria al Banco de Horas (**Opción A — `RN-BH01`**).
  - **Mejora 1 (Implementada)**: Soporte para **múltiples llamados no solapados en un mismo día `DISP`** (ej. llamado en la mañana y segundo llamado en la noche de la misma guardia de disponibilidad).
- **Pendientes de revisión futura sobre Disponibilidades (`DISP`)**:
  - **Mejora 2 (En revisión)**: Soportar *"Turno Presencial Diurno (`M8`/`ADM`) + Disponibilidad Nocturna (`+DISP`) en la misma celda del día"* mediante un indicador secundario en el Inspector de Celda.
  - **Mejora 3 (En revisión)**: Columna de conteo de turnos `DISP` programados en el mes (`Turnos_DISP`) en Pre-Nómina y CSV (en caso de que se reconozca bonificación pasiva por disponibilidad o se audite equidad de retenes).
  - **Mejora 4 (En revisión)**: Alerta visual de fatiga cuando un llamado `DISP` de madrugada reduce a menos de 12h el descanso previo al turno presencial de la mañana siguiente.
