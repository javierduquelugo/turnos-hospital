import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  PermutaItem,
  RegistroAuditoria,
  ServicioHospitalario,
  SesionUsuarioSso,
  SolicitudTiempoAdicionalItem,
} from '../../models';
import { coincideBusquedaCampos, dividirTerminosBusqueda } from '../../utils/busqueda-texto';

@Component({
  selector: 'app-dashboard-solicitudes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrl: './dashboard-solicitudes.component.css',
  template: `
    <div class="dashboard-layout">
      <!-- CABECERA DEL DASHBOARD -->
      <div class="dashboard-header-bar">
        <div>
          <h2>📊 Panel de Solicitudes y Bitácora Asistencial</h2>
          <p class="dashboard-header-desc">
            Monitoreo en tiempo real de cobertura, alertas de descanso, gestión de permutas 1-a-1 y trazabilidad de cambios.
          </p>
        </div>
        <div class="dashboard-header-actions">
          @if (!esColaborador && serviciosVisibles.length > 1) {
            <div class="control-item dash-service-filter">
              <span class="dash-service-icon" aria-hidden="true">🏥</span>
              <label for="dash-servicio-select" class="dash-service-label">Servicio:</label>
              <select
                id="dash-servicio-select"
                class="dash-service-select"
                [ngModel]="servicioSeleccionadoId"
                (ngModelChange)="cambiarServicio.emit($event)">
                @for (srv of serviciosVisibles; track srv.id) {
                  <option [value]="srv.id">{{ srv.nombre }}</option>
                }
              </select>
            </div>
          } @else {
            <span class="badge-service-pill">🏥 {{ servicioNombre || 'Hospital' }}</span>
          }
          <button
            type="button"
            class="btn-outline-refresh"
            (click)="refrescarDatos.emit()"
            title="Actualizar datos desde el servidor">
            🔄 Actualizar
          </button>
        </div>
      </div>

      <!-- TARJETAS DE INDICADORES KPI -->
      <div class="kpi-grid">
        @if (!esColaborador) {
          <div class="kpi-card">
            <div class="kpi-label">Cobertura del Servicio</div>
            <div class="kpi-value" [class.text-pos]="porcentajeCobertura >= 95" [class.text-neg]="porcentajeCobertura < 80">
              {{ porcentajeCobertura }}%
            </div>
            <div class="kpi-sub">{{ servicioNombre }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Alertas de Descanso</div>
            <div class="kpi-value" [class.text-neg]="infraccionesCount > 0" [class.text-pos]="infraccionesCount === 0">
              {{ infraccionesCount }}
            </div>
            <div class="kpi-sub">Descanso mínimo: 12 horas</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Balance Banco de Horas</div>
            <div class="kpi-value" [class.text-pos]="balanceBancoHoras >= 0" [class.text-neg]="balanceBancoHoras < 0">
              {{ formatearSigno(balanceBancoHoras) }}h
            </div>
            <div class="kpi-sub">Total acumulado del servicio</div>
          </div>
        }
        <div class="kpi-card">
          <div class="kpi-label">Cambios de Turno Pendientes</div>
          <div class="kpi-value" [class.text-neg]="notificacionesCount > 0" [class.text-pos]="notificacionesCount === 0">
            {{ notificacionesCount }}
          </div>
          <div class="kpi-sub">{{ esColaborador ? 'Por responder' : 'Por revisar' }}</div>
        </div>
      </div>

      <!-- PANELES DE GESTIÓN: PERMUTAS Y BITÁCORA -->
      <div class="two-col-panels">
        <!-- Panel 1: Solicitudes de Cambio de Turno entre compañeros -->
        <div class="panel-card">
          <div class="panel-header">
            <h3>🔄 Solicitudes de Cambio de Turno (Permutas)</h3>
            <span class="badge-info">{{ countPendientes }} pendientes</span>
          </div>

          <!-- Barra de Filtros y Búsqueda de Permutas -->
          <div class="panel-filter-bar">
            <div class="filter-tabs">
              <button
                type="button"
                class="filter-tab"
                [class.active]="filtroEstadoPermuta === 'TODAS'"
                (click)="filtroEstadoPermuta = 'TODAS'">
                Todas ({{ countTodas }})
              </button>
              <button
                type="button"
                class="filter-tab"
                [class.active]="filtroEstadoPermuta === 'PENDIENTES'"
                (click)="filtroEstadoPermuta = 'PENDIENTES'">
                ⏳ Pendientes ({{ countPendientes }})
              </button>
              <button
                type="button"
                class="filter-tab"
                [class.active]="filtroEstadoPermuta === 'APROBADA'"
                (click)="filtroEstadoPermuta = 'APROBADA'">
                ✅ Aprobadas ({{ countAprobadas }})
              </button>
              <button
                type="button"
                class="filter-tab"
                [class.active]="filtroEstadoPermuta === 'RECHAZADA'"
                (click)="filtroEstadoPermuta = 'RECHAZADA'">
                ❌ Rechazadas ({{ countRechazadas }})
              </button>
            </div>
            <div class="search-input-wrap">
              <input
                type="text"
                aria-label="Buscar solicitudes de permuta por colaborador o turno"
                [(ngModel)]="busquedaPermuta"
                placeholder="🔍 Buscar colaborador o turno..."
                class="filter-search-input" />
              @if (busquedaPermuta) {
                <button
                  type="button"
                  aria-label="Limpiar búsqueda de permutas"
                  class="btn-clear-search"
                  (click)="busquedaPermuta = ''">
                  ✕
                </button>
              }
            </div>
          </div>

          <div class="permutas-list">
            @for (p of permutasFiltradas; track p.id) {
              <div class="permuta-item" [class.permuta-ready]="p.estado === 'PENDIENTE_SUPERVISOR'">
                <div class="permuta-main">
                  <div class="permuta-title">
                    <strong>{{ p.solicitanteNombre }}</strong> (Día {{ p.diaOrigen }}{{ p.mes ? '/' + p.mes : '' }}: <code>{{ p.turnoOrigen }}</code>)
                    ⇄ <strong>{{ p.receptorNombre }}</strong> (Día {{ p.diaDestino }}{{ p.mes ? '/' + p.mes : '' }}: <code>{{ p.turnoDestino }}</code>)
                  </div>
                  <div class="permuta-meta">
                    Cargo: <b>{{ p.categoria }}</b> • Solicitud: {{ p.fechaSolicitud }}
                  </div>
                  <div class="permuta-validation">
                    ✅ {{ p.validacionReglas }}
                  </div>
                  @if (p.motivoRechazo) {
                    <div class="permuta-reject-reason">⚠️ {{ p.motivoRechazo }}</div>
                  }
                </div>
                <div class="permuta-actions">
                  @if (p.estado === 'PENDIENTE_SUPERVISOR') {
                    @if (!esColaborador) {
                      <div class="supervisor-approval-group">
                        <span class="badge-concertada">🤝 Acuerdo mutuo confirmado</span>
                        <div class="btn-group-h">
                          <button type="button" class="btn-approve" (click)="aprobarPermuta.emit(p.id)">
                            ✔ Aprobar Cambio
                          </button>
                          <button type="button" class="btn-reject" (click)="solicitarRechazoSupervisor(p.id)">
                            ✕ Rechazar
                          </button>
                        </div>
                      </div>
                    } @else {
                      <span class="status-tag status-tag-par">⏳ En revisión por Coordinador de Servicio</span>
                    }
                  } @else if (p.estado === 'PENDIENTE_PAR') {
                    @if (sesionActual?.empleadoId === p.receptorId) {
                      <div class="supervisor-approval-group">
                        <span class="badge-incoming-par">📬 Propuesta dirigida a ti</span>
                        <div class="btn-group-h">
                          <button type="button" class="btn-approve" (click)="aceptarPropuestaPar.emit(p.id)">
                            ✅ Aceptar Propuesta
                          </button>
                          <button type="button" class="btn-reject" (click)="solicitarRechazoPar(p.id)">
                            ❌ Declinar
                          </button>
                        </div>
                      </div>
                    } @else {
                      <span class="status-tag status-tag-par">⏳ Esperando respuesta de {{ p.receptorNombre }}</span>
                    }
                  } @else if (p.estado === 'APROBADA') {
                    <span class="status-tag status-tag-ok">✅ Aprobada en Cuadrante</span>
                  } @else {
                    <span class="status-tag status-tag-no">❌ Rechazada</span>
                  }
                </div>
              </div>
            } @empty {
              <div class="text-muted empty-state-box">
                @if (busquedaPermuta || filtroEstadoPermuta !== 'TODAS') {
                  <span>🔍 No se encontraron solicitudes que coincidan con los filtros aplicados.</span>
                } @else {
                  <span>No hay solicitudes de permuta registradas para este servicio.</span>
                }
              </div>
            }
          </div>
        </div>

        <!-- Panel 1.5: Reportes de Tiempo Adicional y Llamados DISP (Modelo B) -->
        <div class="panel-card">
          <div class="panel-header">
            <h3>⏰ Reportes de Tiempo Adicional y Llamados DISP</h3>
            <span class="badge-info">{{ countTiempoPendientes }} pendientes</span>
          </div>

          <div class="panel-filter-bar">
            <div class="filter-tabs">
              <button
                type="button"
                class="filter-tab"
                [class.active]="filtroEstadoTiempo === 'TODAS'"
                (click)="filtroEstadoTiempo = 'TODAS'">
                Todas ({{ solicitudesTiempoAdicional.length }})
              </button>
              <button
                type="button"
                class="filter-tab"
                [class.active]="filtroEstadoTiempo === 'PENDIENTES'"
                (click)="filtroEstadoTiempo = 'PENDIENTES'">
                ⏳ Pendientes ({{ countTiempoPendientes }})
              </button>
              <button
                type="button"
                class="filter-tab"
                [class.active]="filtroEstadoTiempo === 'APROBADA'"
                (click)="filtroEstadoTiempo = 'APROBADA'">
                ✅ Aprobadas ({{ countTiempoAprobadas }})
              </button>
              <button
                type="button"
                class="filter-tab"
                [class.active]="filtroEstadoTiempo === 'RECHAZADA'"
                (click)="filtroEstadoTiempo = 'RECHAZADA'">
                ❌ Rechazadas ({{ countTiempoRechazadas }})
              </button>
            </div>
            <div class="search-input-wrap">
              <input
                type="text"
                aria-label="Buscar reportes de tiempo adicional"
                [(ngModel)]="busquedaTiempo"
                placeholder="🔍 Buscar colaborador, motivo o soporte..."
                class="filter-search-input" />
              @if (busquedaTiempo) {
                <button
                  type="button"
                  aria-label="Limpiar búsqueda de tiempo adicional"
                  class="btn-clear-search"
                  (click)="busquedaTiempo = ''">
                  ✕
                </button>
              }
            </div>
          </div>

          <div class="permutas-list">
            @for (st of solicitudesTiempoFiltradas; track st.id) {
              <div class="permuta-item" [class.permuta-ready]="st.estado === 'PENDIENTE_SUPERVISOR'">
                <div class="permuta-main">
                  <div class="permuta-title">
                    <strong>{{ st.empleadoNombre }}</strong> ({{ st.categoria }}) •
                    Día {{ st.dia }} ({{ st.fechaIso }}) • Turno base <code>{{ st.turnoBase }}</code>
                  </div>
                  <div class="permuta-meta">
                    @if (st.tipo === 'DISPONIBILIDAD_LLAMADO') {
                      <span class="badge-concertada">🚨 Llamado DISP</span>
                    } @else if (st.tipo === 'GUARDIA_EXTRAORDINARIA') {
                      <span class="badge-concertada">⚡ Guardia Extra</span>
                    } @else {
                      <span class="badge-concertada">⏰ Prolongación</span>
                    }
                    • Franja: <b>{{ st.horaInicio }}–{{ st.horaFin }}</b>
                    • Reportadas: <b>+{{ st.horasCalculadas }}h</b>
                    @if (st.horasAprobadas != null && st.horasAprobadas !== st.horasCalculadas) {
                      • Aprobadas: <b>+{{ st.horasAprobadas }}h</b>
                    }
                  </div>
                  <div class="permuta-validation">
                    🏥 <b>[{{ st.motivoCategoria }}]</b> {{ st.motivoDetalle }}
                    @if (st.soporteClinico) {
                      <span> • Soporte: <code>{{ st.soporteClinico }}</code></span>
                    }
                  </div>
                  @if (st.observacionSupervisor) {
                    <div class="permuta-meta">📝 Nota Supervisión: {{ st.observacionSupervisor }} ({{ st.supervisorNombre }})</div>
                  }
                  @if (st.motivoRechazo) {
                    <div class="permuta-reject-reason">⚠️ Motivo rechazo: {{ st.motivoRechazo }}</div>
                  }
                </div>

                <div class="permuta-actions">
                  @if (st.estado === 'PENDIENTE_SUPERVISOR') {
                    @if (!esColaborador) {
                      <div class="supervisor-approval-group">
                        <span class="badge-concertada">⚖️ Banco de Horas + Recargos (RN-BH01)</span>
                        <div class="btn-group-h">
                          <button
                            type="button"
                            class="btn-approve"
                            (click)="aprobarTiempoDirecto(st)"
                            title="Aprobar horas reportadas e integrar al acumulado del mes">
                            ✔ Aprobar (+{{ st.horasCalculadas }}h)
                          </button>
                          <button
                            type="button"
                            class="btn-outline"
                            (click)="abrirModalAjusteTiempo(st)"
                            title="Ajustar cantidad de horas aprobadas según bitácora asistencial">
                            ✏️ Ajustar
                          </button>
                          <button
                            type="button"
                            class="btn-reject"
                            (click)="abrirModalRechazoTiempo(st)"
                            title="Rechazar reporte con justificación">
                            ✕ Rechazar
                          </button>
                        </div>
                      </div>
                    } @else {
                      <span class="status-tag status-tag-par">⏳ En revisión por Coordinación</span>
                    }
                  } @else if (st.estado === 'APROBADA') {
                    <span class="status-tag status-tag-ok">
                      ✅ Aprobada (+{{ st.horasAprobadas ?? st.horasCalculadas }}h ⚡)
                    </span>
                  } @else {
                    <span class="status-tag status-tag-no">❌ Rechazada</span>
                  }
                </div>
              </div>
            } @empty {
              <div class="text-muted empty-state-box">
                @if (busquedaTiempo || filtroEstadoTiempo !== 'TODAS') {
                  <span>🔍 No se encontraron reportes de tiempo adicional con los filtros aplicados.</span>
                } @else {
                  <span>No hay reportes de horas extras o llamados de disponibilidad en este servicio.</span>
                }
              </div>
            }
          </div>
        </div>

        <!-- Panel 2: Historial de Cambios del Cuadro de Turnos (Bitácora de Auditoría) -->
        <div class="panel-card">
          <div class="panel-header">
            <h3>📋 Historial de Cambios del Cuadro de Turnos</h3>
            <span class="badge-info">{{ auditoriasFiltradas.length }} registros</span>
          </div>

          <!-- Barra de Búsqueda de Auditoría -->
          <div class="panel-filter-bar">
            <div class="search-input-wrap search-input-full">
              <input
                type="text"
                aria-label="Buscar en historial de auditoría"
                [(ngModel)]="busquedaAuditoria"
                placeholder="🔍 Buscar por colaborador, actor, motivo, día o turno..."
                class="filter-search-input" />
              @if (busquedaAuditoria) {
                <button
                  type="button"
                  aria-label="Limpiar búsqueda de auditoría"
                  class="btn-clear-search"
                  (click)="busquedaAuditoria = ''">
                  ✕
                </button>
              }
            </div>
          </div>

          <div class="audit-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Fecha / Hora</th>
                  <th>Realizado por</th>
                  <th>Colaborador</th>
                  <th>Día</th>
                  <th>Cambio</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                @for (log of auditoriasFiltradas; track log.id) {
                  <tr>
                    <td class="font-mono">{{ log.timestamp }}</td>
                    <td>{{ log.actor }}</td>
                    <td><strong>{{ log.empleadoNombre }}</strong></td>
                    <td>{{ log.dia > 0 ? 'Día ' + log.dia : 'Mes completo' }}</td>
                    <td>
                      <span class="mini-shift">{{ log.turnoAnterior || 'Vacío' }}</span>
                      →
                      <span class="mini-shift">{{ log.turnoNuevo || 'Vacío' }}</span>
                    </td>
                    <td>{{ log.motivo }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="text-muted dash-empty-row">
                      @if (busquedaAuditoria) {
                        🔍 No se encontraron registros de auditoría que coincidan con "{{ busquedaAuditoria }}".
                      } @else {
                        🛡️ No hay movimientos de auditoría registrados para este servicio.
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    @if (modalRechazoAbierto) {
      <div class="modal-backdrop" (click)="cerrarModalRechazo()">
        <div
          class="modal-box"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-rechazo-title"
          (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 id="modal-rechazo-title">
              {{ modoRechazoModal === 'SUPERVISOR' ? '✕ Rechazar Solicitud de Permuta' : '❌ Declinar Propuesta de Cambio' }}
            </h3>
            <button type="button" aria-label="Cerrar diálogo" (click)="cerrarModalRechazo()">✕</button>
          </div>
          <div class="modal-body">
            @if (modoRechazoModal === 'SUPERVISOR') {
              <div class="dash-modal-field">
                <label for="motivo-rechazo-permuta">Motivo del rechazo de la solicitud:</label>
                <textarea
                  id="motivo-rechazo-permuta"
                  class="dash-modal-textarea"
                  [(ngModel)]="motivoRechazoModal"
                  placeholder="Describa el motivo asistencial u operativo..."></textarea>
              </div>
            } @else {
              <p class="dash-modal-desc">
                ¿Está seguro de declinar esta propuesta de cambio de turno? Esta acción notificará al compañero solicitante.
              </p>
            }
            <div class="modal-footer-confirm">
              <button type="button" class="btn-outline" (click)="cerrarModalRechazo()">Cancelar</button>
              <button type="button" class="btn-danger" (click)="confirmarModalRechazo()">
                {{ modoRechazoModal === 'SUPERVISOR' ? 'Confirmar Rechazo' : 'Declinar Propuesta' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    @if (modalTiempoAbierto && solicitudTiempoObjetivo) {
      <div class="modal-backdrop" (click)="cerrarModalTiempo()">
        <div
          class="modal-box"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-tiempo-title"
          (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 id="modal-tiempo-title">
              {{ modoModalTiempo === 'AJUSTAR' ? '✏️ Ajustar y Aprobar Tiempo Adicional' : '✕ Rechazar Reporte de Tiempo Adicional' }}
            </h3>
            <button type="button" aria-label="Cerrar diálogo" (click)="cerrarModalTiempo()">✕</button>
          </div>
          <div class="modal-body">
            <p class="dash-modal-desc">
              <strong>{{ solicitudTiempoObjetivo.empleadoNombre }}</strong> • Día {{ solicitudTiempoObjetivo.dia }} ({{ solicitudTiempoObjetivo.fechaIso }}) •
              Franja reportada: <b>{{ solicitudTiempoObjetivo.horaInicio }}–{{ solicitudTiempoObjetivo.horaFin }}</b> (+{{ solicitudTiempoObjetivo.horasCalculadas }}h)
            </p>

            @if (modoModalTiempo === 'AJUSTAR') {
              <div class="dash-modal-field">
                <label for="horas-aprobadas-input">Horas reales a aprobar según bitácora asistencial:</label>
                <input
                  id="horas-aprobadas-input"
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="16"
                  class="filter-search-input"
                  [(ngModel)]="horasAprobadasModal" />
              </div>
              <div class="dash-modal-field">
                <label for="obs-supervisor-tiempo">Observación de Supervisión (Opcional):</label>
                <textarea
                  id="obs-supervisor-tiempo"
                  class="dash-modal-textarea"
                  [(ngModel)]="observacionSupervisorModal"
                  placeholder="Ej: Ajustado según bitácora de quirófano / entrega de guardia..."></textarea>
              </div>
              <div class="modal-footer-confirm">
                <button type="button" class="btn-outline" (click)="cerrarModalTiempo()">Cancelar</button>
                <button
                  type="button"
                  class="btn-approve"
                  [disabled]="!horasAprobadasModal || horasAprobadasModal <= 0 || horasAprobadasModal > 16"
                  (click)="confirmarModalTiempo()">
                  ✔ Confirmar Aprobación (+{{ horasAprobadasModal }}h)
                </button>
              </div>
            } @else {
              <div class="dash-modal-field">
                <label for="motivo-rechazo-tiempo">Motivo obligatorio del rechazo:</label>
                <textarea
                  id="motivo-rechazo-tiempo"
                  class="dash-modal-textarea"
                  [(ngModel)]="motivoRechazoTiempoModal"
                  placeholder="Describa el motivo clínico o administrativo del rechazo..."></textarea>
              </div>
              <div class="modal-footer-confirm">
                <button type="button" class="btn-outline" (click)="cerrarModalTiempo()">Cancelar</button>
                <button
                  type="button"
                  class="btn-danger"
                  [disabled]="motivoRechazoTiempoModal.trim().length < 4"
                  (click)="confirmarModalTiempo()">
                  Confirmar Rechazo
                </button>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class DashboardSolicitudesComponent {
  @Input() porcentajeCobertura = 0;
  @Input() servicioSeleccionadoId = '';
  @Input() serviciosVisibles: ServicioHospitalario[] = [];
  @Input() servicioNombre = '';
  @Input() infraccionesCount = 0;
  @Input() balanceBancoHoras = 0;
  @Input() notificacionesCount = 0;
  @Input() esColaborador = false;
  @Input() permutas: PermutaItem[] = [];
  @Input() solicitudesTiempoAdicional: SolicitudTiempoAdicionalItem[] = [];
  @Input() bitacoraAuditoria: RegistroAuditoria[] = [];
  @Input() sesionActual: SesionUsuarioSso | null = null;

  @Output() cambiarServicio = new EventEmitter<string>();
  @Output() aprobarPermuta = new EventEmitter<string>();
  @Output() rechazarPermuta = new EventEmitter<string | { id: string; motivo: string }>();
  @Output() aceptarPropuestaPar = new EventEmitter<string>();
  @Output() rechazarPropuestaPar = new EventEmitter<string>();
  @Output() resolverTiempoAdicional = new EventEmitter<{
    id: string;
    accion: 'APROBAR' | 'RECHAZAR';
    horasAprobadas?: number;
    observacionSupervisor?: string;
    motivoRechazo?: string;
  }>();
  @Output() refrescarDatos = new EventEmitter<void>();

  filtroEstadoPermuta: 'TODAS' | 'PENDIENTES' | 'APROBADA' | 'RECHAZADA' = 'TODAS';
  busquedaPermuta = '';
  filtroEstadoTiempo: 'TODAS' | 'PENDIENTES' | 'APROBADA' | 'RECHAZADA' = 'TODAS';
  busquedaTiempo = '';
  busquedaAuditoria = '';

  modalRechazoAbierto = false;
  modoRechazoModal: 'SUPERVISOR' | 'PAR' = 'SUPERVISOR';
  permutaObjetivoId = '';
  motivoRechazoModal = 'Rechazada por necesidades asistenciales del servicio';

  modalTiempoAbierto = false;
  modoModalTiempo: 'AJUSTAR' | 'RECHAZAR' = 'AJUSTAR';
  solicitudTiempoObjetivo: SolicitudTiempoAdicionalItem | null = null;
  horasAprobadasModal = 0;
  observacionSupervisorModal = '';
  motivoRechazoTiempoModal = 'No justificado en bitácora asistencial del servicio';

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.modalRechazoAbierto) {
      this.cerrarModalRechazo();
    }
    if (this.modalTiempoAbierto) {
      this.cerrarModalTiempo();
    }
  }

  get countTiempoPendientes(): number {
    return this.solicitudesTiempoAdicional.filter((s) => s.estado === 'PENDIENTE_SUPERVISOR').length;
  }

  get countTiempoAprobadas(): number {
    return this.solicitudesTiempoAdicional.filter((s) => s.estado === 'APROBADA').length;
  }

  get countTiempoRechazadas(): number {
    return this.solicitudesTiempoAdicional.filter((s) => s.estado === 'RECHAZADA').length;
  }

  get solicitudesTiempoFiltradas(): SolicitudTiempoAdicionalItem[] {
    const terminos = dividirTerminosBusqueda(this.busquedaTiempo);
    return this.solicitudesTiempoAdicional.filter((s) => {
      if (this.filtroEstadoTiempo === 'PENDIENTES') {
        if (s.estado !== 'PENDIENTE_SUPERVISOR') return false;
      } else if (this.filtroEstadoTiempo !== 'TODAS') {
        if (s.estado !== this.filtroEstadoTiempo) return false;
      }
      if (
        terminos.length > 0 &&
        !coincideBusquedaCampos(terminos, [
          s.empleadoNombre,
          s.categoria,
          s.turnoBase,
          s.motivoCategoria,
          s.motivoDetalle,
          s.soporteClinico,
          s.dia,
        ])
      ) {
        return false;
      }
      return true;
    });
  }

  aprobarTiempoDirecto(st: SolicitudTiempoAdicionalItem): void {
    this.resolverTiempoAdicional.emit({
      id: st.id,
      accion: 'APROBAR',
      horasAprobadas: st.horasCalculadas,
    });
  }

  abrirModalAjusteTiempo(st: SolicitudTiempoAdicionalItem): void {
    this.solicitudTiempoObjetivo = st;
    this.modoModalTiempo = 'AJUSTAR';
    this.horasAprobadasModal = st.horasCalculadas;
    this.observacionSupervisorModal = '';
    this.modalTiempoAbierto = true;
  }

  abrirModalRechazoTiempo(st: SolicitudTiempoAdicionalItem): void {
    this.solicitudTiempoObjetivo = st;
    this.modoModalTiempo = 'RECHAZAR';
    this.motivoRechazoTiempoModal = 'No justificado en bitácora asistencial del servicio';
    this.modalTiempoAbierto = true;
  }

  cerrarModalTiempo(): void {
    this.modalTiempoAbierto = false;
    this.solicitudTiempoObjetivo = null;
  }

  confirmarModalTiempo(): void {
    if (!this.solicitudTiempoObjetivo) {
      this.cerrarModalTiempo();
      return;
    }
    if (this.modoModalTiempo === 'AJUSTAR') {
      this.resolverTiempoAdicional.emit({
        id: this.solicitudTiempoObjetivo.id,
        accion: 'APROBAR',
        horasAprobadas: Number(this.horasAprobadasModal),
        observacionSupervisor: this.observacionSupervisorModal.trim() || undefined,
      });
    } else {
      this.resolverTiempoAdicional.emit({
        id: this.solicitudTiempoObjetivo.id,
        accion: 'RECHAZAR',
        motivoRechazo:
          this.motivoRechazoTiempoModal.trim() ||
          'Rechazada por supervisión asistencial',
      });
    }
    this.cerrarModalTiempo();
  }

  get countTodas(): number {
    return this.permutas.length;
  }

  get countPendientes(): number {
    return this.permutas.filter(
      (p) => p.estado === 'PENDIENTE_SUPERVISOR' || p.estado === 'PENDIENTE_PAR'
    ).length;
  }

  get countAprobadas(): number {
    return this.permutas.filter((p) => p.estado === 'APROBADA').length;
  }

  get countRechazadas(): number {
    return this.permutas.filter((p) => p.estado === 'RECHAZADA').length;
  }

  get permutasFiltradas(): PermutaItem[] {
    const terminos = dividirTerminosBusqueda(this.busquedaPermuta);
    return this.permutas.filter((p) => {
      // Filtro de Estado
      if (this.filtroEstadoPermuta === 'PENDIENTES') {
        if (p.estado !== 'PENDIENTE_SUPERVISOR' && p.estado !== 'PENDIENTE_PAR') return false;
      } else if (this.filtroEstadoPermuta !== 'TODAS') {
        if (p.estado !== this.filtroEstadoPermuta) return false;
      }

      // Filtro de Búsqueda
      if (
        terminos.length > 0 &&
        !coincideBusquedaCampos(terminos, [
          p.solicitanteNombre,
          p.receptorNombre,
          p.categoria,
          p.turnoOrigen,
          p.turnoDestino,
          p.diaOrigen,
          p.diaDestino,
        ])
      ) {
        return false;
      }

      return true;
    });
  }

  get auditoriasFiltradas(): RegistroAuditoria[] {
    const terminos = dividirTerminosBusqueda(this.busquedaAuditoria);
    let base = this.bitacoraAuditoria;
    if (this.esColaborador) {
      const miId = this.sesionActual?.empleadoId;
      const miDoc = this.sesionActual?.documento;
      base = base.filter(
        (log) =>
          (miId && log.empleadoId === miId) ||
          (miDoc && log.empleadoDocumento === miDoc)
      );
    } else if (this.servicioSeleccionadoId) {
      base = base.filter((log) => log.servicioId === this.servicioSeleccionadoId);
    }
    const porServicio = base;
    if (terminos.length === 0) return porServicio;
    return porServicio.filter((log) =>
      coincideBusquedaCampos(terminos, [
        log.empleadoNombre,
        log.actor,
        log.motivo,
        log.turnoNuevo,
        log.turnoAnterior,
        log.dia,
      ])
    );
  }

  formatearSigno(n?: number): string {
    const val = Number(n) || 0;
    return (val > 0 ? '+' : '') + val;
  }

  solicitarRechazoSupervisor(idPermuta: string): void {
    this.permutaObjetivoId = idPermuta;
    this.modoRechazoModal = 'SUPERVISOR';
    this.motivoRechazoModal = 'Rechazada por necesidades asistenciales del servicio';
    this.modalRechazoAbierto = true;
  }

  solicitarRechazoPar(idPermuta: string): void {
    this.permutaObjetivoId = idPermuta;
    this.modoRechazoModal = 'PAR';
    this.modalRechazoAbierto = true;
  }

  cerrarModalRechazo(): void {
    this.modalRechazoAbierto = false;
    this.permutaObjetivoId = '';
  }

  confirmarModalRechazo(): void {
    if (!this.permutaObjetivoId) {
      this.cerrarModalRechazo();
      return;
    }
    if (this.modoRechazoModal === 'SUPERVISOR') {
      this.rechazarPermuta.emit({
        id: this.permutaObjetivoId,
        motivo: this.motivoRechazoModal.trim() || 'Rechazada por la supervisora asistencial',
      });
    } else {
      this.rechazarPropuestaPar.emit(this.permutaObjetivoId);
    }
    this.cerrarModalRechazo();
  }
}
