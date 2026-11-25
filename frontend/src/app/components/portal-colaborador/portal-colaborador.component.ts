import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CeldaAsignacion,
  DiaColumna,
  EmpleadoHospital,
  PermutaItem,
  RolUsuarioSso,
  ServicioHospitalario,
  SolicitudTiempoAdicionalItem,
  TipoTurnoConfig,
} from '../../models';
import {
  duracionHorarioMin,
  esCodigoExoneracionContrato,
  hoyColombiaIso,
  r2,
} from '../../shared/liquidacion-horas';
import { obtenerTandasBreakDeTurno } from '../../calculo-turnos.helper';

export interface DatosEmpleadoPortal {
  empleado: EmpleadoHospital;
  servicioBase?: ServicioHospitalario;
  celdas: Record<number, CeldaAsignacion>;
  horasTrabajadas: number;
  conteoNoches: number;
  conteoDomFest: number;
  conteoDomingos?: number;
  horasContratadasNominales?: number;
  horasContratadasEfectivas?: number;
  horasExoneradas?: number;
  diasHabilesMes?: number;
  diasHabilesProrrateados?: number;
  diasExonerados?: number;
  horasSemanalesAplicadas?: number;
  empresaCodigo?: string;
  empresaNombre?: string;
  empresaEstadoConfiguracion?: string;
  nuevoSaldoBanco: number;
  diferenciaMes: number;
  [key: string]: any;
}

@Component({
  selector: 'app-portal-colaborador',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrl: './portal-colaborador.component.css',
  template: `
    <div class="nomina-container">
      <div class="nomina-banner">
        <div class="selectors-group">
          <div class="logo-badge" aria-hidden="true">👩‍⚕️</div>
          <div>
            <h2>Mi Calendario Personal de Turnos</h2>
            <div class="portal-meta-row">
              <span class="periodo-tag">📅 {{ nombreMesSeleccionado }} {{ anioSeleccionado }}</span>
              @if (estadoCuadrante === 'PUBLICADO') {
                <span class="periodo-tag periodo-tag-pub">🟢 Publicado Oficial</span>
              } @else if (estadoCuadrante === 'CERRADO_NOMINA') {
                <span class="periodo-tag periodo-tag-cerrado">🔒 Cerrado Nómina</span>
              } @else if (estadoCuadrante === 'BORRADOR') {
                <span class="periodo-tag periodo-tag-borrador">📝 En Borrador (No Oficial)</span>
              } @else {
                <span class="periodo-tag periodo-tag-sin">⚪ Sin Planificar</span>
              }
              <span class="portal-subtitle">Programación individual y gestión de permutas</span>
            </div>
          </div>
        </div>

        <div class="portal-header-controls">
          <div class="control-item">
            <label for="portal-mes-select">Periodo:</label>
            <div class="month-stepper">
              <button
                type="button"
                class="btn-nav-month"
                aria-label="Ir al mes anterior"
                [disabled]="!puedeRetrocederMes"
                (click)="retrocederMes()"
                title="Ir al mes anterior">
                ◀
              </button>
              <select
                id="portal-mes-select"
                class="select-month-input"
                aria-label="Mes del calendario personal"
                [disabled]="mesesDisponibles.length === 0"
                [ngModel]="mesSeleccionado"
                (ngModelChange)="cambiarMes.emit(+$event)">
                @for (m of mesesDisponibles; track m.valor) {
                  <option [value]="m.valor">{{ m.nombre }}</option>
                } @empty {
                  <option [value]="mesSeleccionado">Sin meses publicados</option>
                }
              </select>
              <select
                id="portal-anio-select"
                class="select-month-input"
                aria-label="Año del calendario personal"
                [ngModel]="anioSeleccionado"
                (ngModelChange)="cambiarAnio.emit(+$event)"
                title="Año del calendario">
                @for (a of aniosDisponibles; track a) {
                  <option [value]="a">{{ a }}</option>
                }
              </select>
              <button
                type="button"
                class="btn-nav-month"
                aria-label="Ir al mes siguiente"
                [disabled]="!puedeAvanzarMes"
                (click)="avanzarMes()"
                title="Ir al mes siguiente">
                ▶
              </button>
              <button
                type="button"
                class="btn-hoy-period"
                [class.is-current]="esPeriodoActual"
                [disabled]="esPeriodoActual || !puedeIrAHoy"
                (click)="irAMesActual.emit()"
                [title]="esPeriodoActual ? 'Ya estás viendo el mes actual' : (!puedeIrAHoy ? 'El mes actual aún no tiene programación publicada' : 'Volver al mes actual')">
                {{ esPeriodoActual ? '● Hoy' : 'Hoy' }}
              </button>
            </div>
          </div>

          @if (esAdminTh || esCoordinador) {
            <div class="control-item">
              <label for="portal-emp-select">{{ esAdminTh ? 'Ver calendario de:' : 'Supervisar colaborador:' }}</label>
              <select
                id="portal-emp-select"
                [ngModel]="empleadoPortalId"
                (ngModelChange)="cambiarEmpleadoPortal.emit($event)">
                @for (e of empleados; track e.id) {
                  <option [value]="e.id">{{ e.nombre }} ({{ e.categoria }})</option>
                }
              </select>
            </div>
          } @else {
            <div class="control-item">
              <span class="badge-personal portal-session-pill">
                🔐 Sesión Intranet: <strong>{{ portal.empleado.nombre }}</strong> ({{ etiquetaRol(rolActual) }})
              </span>
            </div>
          }
        </div>
      </div>

      <!-- Banner de Advertencia de Estado del Cuadrante -->
      @if (mesesDisponibles.length > 0 && estadoCuadrante === 'BORRADOR') {
        <div class="portal-alert-banner portal-alert-borrador">
          <span class="portal-alert-icon" aria-hidden="true">⚠️</span>
          <div>
            <strong>Cuadrante en Elaboración (Borrador):</strong> La programación de <strong>{{ nombreMesSeleccionado }} {{ anioSeleccionado }}</strong> para el servicio <strong>{{ portal.servicioBase?.nombre }}</strong> está en fase de diseño por la coordinación y aún no es oficial. Los turnos asignados son preliminares y no admiten permutas hasta su publicación oficial.
          </div>
        </div>
      } @else if (mesesDisponibles.length > 0 && estadoCuadrante === 'SIN_PLANIFICAR') {
        <div class="portal-alert-banner portal-alert-sin">
          <span class="portal-alert-icon" aria-hidden="true">⚪</span>
          <div>
            <strong>Periodo Sin Planificar:</strong> Aún no se ha iniciado la planificación del cuadrante de <strong>{{ nombreMesSeleccionado }} {{ anioSeleccionado }}</strong> para <strong>{{ portal.servicioBase?.nombre }}</strong>. No hay turnos asignados para este mes.
          </div>
        </div>
      }

      @if (mesesDisponibles.length === 0) {
        <div class="empty-portal-container">
          <div class="empty-portal-icon" aria-hidden="true">📅</div>
          <h3 class="empty-portal-title">Sin Cuadrantes Publicados</h3>
          <p class="empty-portal-desc">
            El servicio <strong>{{ portal.servicioBase?.nombre || 'asignado' }}</strong> no tiene programación de turnos publicada oficialmente para el año {{ anioSeleccionado }}.
          </p>
          <div class="empty-portal-sub">
            Tan pronto como la coordinación publique el cuadrante oficial del mes, tus turnos, horarios y la gestión de permutas estarán disponibles aquí.
          </div>
        </div>
      } @else {
        <!-- CINTA DE RESUMEN COMPACTO MÓVIL (<= 768px): SUSTITUYE AL BANNER Y KPI-GRID EN CELULAR -->
        <div class="portal-mobile-strip">
          <div class="mobile-strip-chips">
            <span class="mobile-strip-chip chip-service" [title]="portal.servicioBase?.nombre || 'Servicio'">
              🏥 {{ portal.servicioBase?.nombre || 'Servicio' }}
            </span>
            <span class="mobile-strip-chip chip-hours" [title]="construirTooltipMetaPortal()">
              ⏰ {{ portal.horasTrabajadas }}h / {{ portal.horasContratadasEfectivas ?? portal.horasContratadasNominales ?? portal.empleado.horasContratoMes }}h{{ (portal['horasAdicionalesAprobadas'] || 0) > 0 ? ' (+' + portal['horasAdicionalesAprobadas'] + 'h⚡)' : '' }}
            </span>
            <span
              class="mobile-strip-chip chip-banco"
              [class.banco-pos]="portal.nuevoSaldoBanco > 0"
              [class.banco-neg]="portal.nuevoSaldoBanco < 0"
              [title]="'Saldo anterior: ' + formatearSigno(portal.empleado.saldoBancoAnterior) + 'h • En este mes: ' + formatearSigno(portal.diferenciaMes) + 'h'">
              🏦 {{ formatearSigno(portal.nuevoSaldoBanco) }}h
            </span>
          </div>
          @if (esAdminTh || esCoordinador) {
            <div class="mobile-strip-supervisor">
              <select
                id="portal-emp-select-mobile"
                class="mobile-strip-select"
                [ngModel]="empleadoPortalId"
                (ngModelChange)="cambiarEmpleadoPortal.emit($event)"
                aria-label="Seleccionar colaborador">
                @for (e of empleados; track e.id) {
                  <option [value]="e.id">{{ e.nombre }}</option>
                }
              </select>
            </div>
          }
        </div>

        <!-- Bloque 1: Tarjetas de Resumen Personal y Mi Banco de Horas (Solo Desktop) -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Servicio y Cargo</div>
            <div class="kpi-value kpi-value-srv">{{ portal.servicioBase?.nombre || 'Servicio Asistencial' }}</div>
            <div class="kpi-sub">{{ portal.empleado.categoria }} • C.C. {{ portal.empleado.documento }}</div>
            @if (portal.empresaCodigo || portal.empleado.empresaContratante) {
              <div class="portal-empresa-row">
                <span
                  class="portal-empresa-pill"
                  [class.is-pendiente]="portal.empresaEstadoConfiguracion === 'PENDIENTE_REGLAS'"
                  [title]="(portal.empresaNombre || portal.empleado.empresaContratante?.nombre || 'Empresa') + ' · Jornada ' + (portal.horasSemanalesAplicadas ?? portal.empleado.horasSemanalesAplicadas ?? 42) + 'h/sem'">
                  🏢 {{ portal.empresaNombre || portal.empleado.empresaContratante?.nombre || portal.empresaCodigo }} · {{ portal.horasSemanalesAplicadas ?? portal.empleado.horasSemanalesAplicadas ?? 42 }}h/sem
                </span>
              </div>
            }
          </div>

          <div class="kpi-card">
            <div class="kpi-label">Horas Programadas en {{ nombreMesSeleccionado }}</div>
            <div
              class="kpi-value"
              [title]="construirTooltipMetaPortal()">
              {{ portal.horasTrabajadas }}h <span class="kpi-contract-sub">/ {{ portal.horasContratadasEfectivas ?? portal.horasContratadasNominales ?? portal.empleado.horasContratoMes }}h</span>
            </div>
            <div class="kpi-sub">
              🌙 {{ portal.conteoNoches }} Noches • ☀️ {{ portal.conteoDomFest }} Dom/Fest ({{ portal.conteoDomingos || 0 }} dom)
              @if ((portal['horasAdicionalesAprobadas'] || 0) > 0) {
                <span> • ⚡ +{{ portal['horasAdicionalesAprobadas'] }}h adic.</span>
              }
              @if ((portal.diasHabilesProrrateados ?? portal.diasExonerados ?? 0) > 0) {
                <span> • 📉 -{{ portal.horasExoneradas || 0 }}h ({{ portal.diasHabilesProrrateados ?? portal.diasExonerados }} d.h.)</span>
              }
            </div>
          </div>

          <div class="kpi-card kpi-card-banco">
            <div class="kpi-label">🏦 Mi Banco de Horas</div>
            <div class="kpi-value" [class.text-pos]="portal.nuevoSaldoBanco > 0" [class.text-neg]="portal.nuevoSaldoBanco < 0">
              {{ formatearSigno(portal.nuevoSaldoBanco) }}h
            </div>
            <div class="kpi-sub">
              Saldo ant: <b>{{ formatearSigno(portal.empleado.saldoBancoAnterior) }}h</b> • En {{ nombreMesSeleccionado }}: <b>{{ formatearSigno(portal.diferenciaMes) }}h</b>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-label">Calendario en el Celular</div>
            <div class="portal-ical-cta">
              <button type="button" class="btn-primary" (click)="abrirModalIcal.emit()">
                📲 Vincular a Google / iPhone
              </button>
            </div>
            <div class="kpi-sub">Se actualiza automáticamente</div>
          </div>
        </div>

        <!-- Bloque 2: Mi Calendario Mensual Personal (Selector Agenda vs Cuadrícula Mes) -->
        <div class="panel-card">
          <div class="panel-header portal-cal-header">
            <div class="portal-cal-title-cluster">
              <h3>📅 Turnos de {{ nombreMesSeleccionado }} {{ anioSeleccionado }}</h3>
              <div class="month-stepper">
                <button
                  type="button"
                  class="btn-month-pill"
                  [disabled]="!puedeRetrocederMes"
                  (click)="retrocederMes()"
                  title="Ver mes anterior">
                  ◀ {{ mesAnteriorNombre }}
                </button>
                <span class="pill-month-active">{{ nombreMesSeleccionado }}</span>
                <button
                  type="button"
                  class="btn-month-pill"
                  [disabled]="!puedeAvanzarMes"
                  (click)="avanzarMes()"
                  title="Ver mes siguiente">
                  {{ mesSiguienteNombre }} ▶
                </button>
              </div>
            </div>

            <div class="portal-cal-header-actions">
              <div class="portal-view-switcher" role="tablist" aria-label="Cambiar vista del calendario">
                <button
                  type="button"
                  role="tab"
                  class="btn-view-tab"
                  [class.is-active]="modoVistaPortal() === 'AGENDA'"
                  [attr.aria-selected]="modoVistaPortal() === 'AGENDA'"
                  (click)="cambiarModoVista('AGENDA')"
                  title="Ver turnos en lista continua (Ideal para celular)">
                  📋 Agenda
                </button>
                <button
                  type="button"
                  role="tab"
                  class="btn-view-tab"
                  [class.is-active]="modoVistaPortal() === 'MES'"
                  [attr.aria-selected]="modoVistaPortal() === 'MES'"
                  (click)="cambiarModoVista('MES')"
                  title="Ver cuadrícula mensual completa">
                  📅 Mes
                </button>
              </div>
              <span class="badge-info">Día {{ diaPermutaSeleccionado }} de {{ nombreMesSeleccionado }} Seleccionado</span>
            </div>
          </div>

          @if (modoVistaPortal() === 'AGENDA') {
            <!-- MODO 1: VISTA AGENDA DIARIA VERTICAL (MOBILE-FIRST) -->
            <div class="agenda-calendar-list" role="feed" aria-label="Lista diaria de turnos">
              @for (d of diasDelMes; track d.dia) {
                @let celdaMia = obtenerCeldaDia(d.dia);
                @let cfgMio = obtenerConfigTurno(celdaMia?.codigo || '');
                @let srvDia = obtenerServicioDiaPortal(celdaMia, portal.empleado.servicioBaseId);
                @let brkDia = obtenerBreakPortal(celdaMia, cfgMio);

                <article
                  class="agenda-day-card"
                  [id]="'agenda-card-dia-' + d.dia"
                  [class.selected-day]="diaPermutaSeleccionado === d.dia"
                  [class.today-card]="!!d.esHoy"
                  [class.holiday-card]="!!d.festivo"
                  [class.weekend-card]="d.esSabado || d.esDomingo"
                  [class.is-free]="!celdaMia?.codigo || celdaMia?.codigo === 'L'"
                  (click)="seleccionarDiaEnPortal.emit(d.dia)"
                  (contextmenu)="onCardContextMenu($event, d.dia)">
                  <div class="agenda-day-date-col">
                    <span class="agenda-day-number">{{ d.dia }}</span>
                    <span class="agenda-day-weekday">{{ d.letraDia }}</span>
                    @if (d.esHoy) {
                      <span class="agenda-hoy-badge">Hoy</span>
                    }
                    @if (d.festivo) {
                      <span class="agenda-festivo-pill" [title]="d.festivo.nombre">🇨🇴 Festivo</span>
                    }
                  </div>

                  <div class="agenda-day-body">
                    @if (celdaMia && celdaMia.codigo && celdaMia.codigo !== 'L') {
                      <div class="agenda-shift-header">
                        <span
                          class="agenda-shift-badge"
                          [style.background-color]="cfgMio ? cfgMio.bgHex : '#f8fafc'"
                          [style.color]="cfgMio ? cfgMio.textHex : '#0f172a'"
                          [style.border-color]="cfgMio ? cfgMio.borderHex : '#cbd5e1'">
                          {{ celdaMia.codigo }} · {{ cfgMio ? cfgMio.nombre : celdaMia.codigo }}
                        </span>
                        <span class="agenda-shift-hours">⏰ {{ cfgMio ? cfgMio.horario : 'Turno programado' }}</span>
                        @if ((celdaMia.horasAdicionalesAprobadas || 0) > 0) {
                          <span class="badge-extra-aprobada" title="Tiempo adicional aprobado por supervisión">
                            +{{ celdaMia.horasAdicionalesAprobadas }}h ⚡
                          </span>
                        }
                        @if ((celdaMia.solicitudesPendientesCount || 0) > 0) {
                          <span class="badge-extra-pendiente" title="Reporte de tiempo adicional en revisión por supervisión">
                            ⏳ Extra pend.
                          </span>
                        }
                      </div>

                      <div class="agenda-shift-meta">
                        @if (srvDia) {
                          <span class="agenda-meta-item agenda-service-tag" [class.srv-rotado]="srvDia.esRotacion">
                            {{ srvDia.esRotacion ? '🔄 Apoyo en ' : '🏥 ' }}{{ srvDia.nombre }}
                          </span>
                        }
                        @if (brkDia) {
                          <span class="agenda-meta-item agenda-break-tag" [class.is-paid]="brkDia.remunerado">
                            🍽️ Break {{ brkDia.etiqueta }}: {{ brkDia.inicio }}–{{ brkDia.fin }}
                          </span>
                        }
                        @if (celdaMia.fijada) {
                          <span class="agenda-meta-item agenda-pin-tag">📌 Turno fijo</span>
                        }
                      </div>

                      @if (celdaMia.nota) {
                        <div class="agenda-shift-note">💬 {{ celdaMia.nota }}</div>
                      }
                    } @else if (celdaMia?.codigo === 'L') {
                      <div class="agenda-shift-free">
                        <span class="agenda-free-badge">🏖️ Descanso (Libre)</span>
                        <span class="agenda-free-desc">Disfrute de descanso semanal programado</span>
                        @if ((celdaMia?.horasAdicionalesAprobadas || 0) > 0) {
                          <span class="badge-extra-aprobada">
                            +{{ celdaMia?.horasAdicionalesAprobadas }}h ⚡
                          </span>
                        }
                        @if ((celdaMia?.solicitudesPendientesCount || 0) > 0) {
                          <span class="badge-extra-pendiente">⏳ Extra pend.</span>
                        }
                      </div>
                    } @else {
                      <div class="agenda-shift-unassigned">
                        <span class="agenda-unassigned-badge">⚪ Sin turno asignado</span>
                        @if ((celdaMia?.horasAdicionalesAprobadas || 0) > 0) {
                          <span class="badge-extra-aprobada">
                            +{{ celdaMia?.horasAdicionalesAprobadas }}h ⚡
                          </span>
                        }
                        @if ((celdaMia?.solicitudesPendientesCount || 0) > 0) {
                          <span class="badge-extra-pendiente">⏳ Extra pend.</span>
                        }
                      </div>
                    }
                    @if (celdaMia?.tramosAdicionales && celdaMia!.tramosAdicionales!.length > 0) {
                      <div class="agenda-extra-tramos-list">
                        @for (tr of celdaMia!.tramosAdicionales!; track tr.id) {
                          <span class="agenda-extra-tramo-pill">
                            ⚡ {{ tr.horaInicio }}–{{ tr.horaFin }} (+{{ tr.horasAprobadas }}h) · {{ tr.motivoDetalle }}
                          </span>
                        }
                      </div>
                    }
                  </div>

                  <div class="agenda-day-actions">
                    @let ctrlExtraDia = evaluarControlTiempoAdicional(d);
                    @if (ctrlExtraDia.habilitado) {
                      <button
                        type="button"
                        class="btn-agenda-action btn-extra-trigger"
                        [class.is-disp]="ctrlExtraDia.tipo === 'DISPONIBILIDAD_LLAMADO'"
                        (click)="abrirModalTiempoAdicional($event, d.dia)"
                        [title]="ctrlExtraDia.titulo">
                        {{ ctrlExtraDia.etiquetaCorto }}
                      </button>
                    }
                    <button
                      type="button"
                      class="btn-agenda-action btn-permuta-trigger"
                      (click)="$event.stopPropagation(); seleccionarDiaEnPortal.emit(d.dia)"
                      title="Solicitar cambio para este día">
                      🔄 Permutar
                    </button>
                    <button
                      type="button"
                      class="btn-agenda-action btn-info-trigger"
                      (click)="onInfoDiaClick($event, d.dia)"
                      title="Ver detalle e historial">
                      ℹ️
                    </button>
                  </div>
                </article>
              }
            </div>
          } @else {
            <div class="weekly-calendar-grid">
            <!-- Cabecera de los 7 días de la semana -->
            <div class="weekday-header">Lunes</div>
            <div class="weekday-header">Martes</div>
            <div class="weekday-header">Miércoles</div>
            <div class="weekday-header">Jueves</div>
            <div class="weekday-header">Viernes</div>
            <div class="weekday-header sat-header">Sábado</div>
            <div class="weekday-header sun-header">Domingo</div>

            <!-- Celdas vacías previas al Día 1 para cuadrar la primera semana -->
            @for (slot of celdasOffsetInicioMes; track slot) {
              <div
                class="emp-day-card empty-slot"
                [class.sat-card]="slot === 5"
                [class.sun-card]="slot === 6"
                aria-hidden="true">
              </div>
            }

            <!-- Días reales del mes en filas semanales de 7 columnas -->
            @for (d of diasDelMes; track d.dia) {
              @let celdaMia = obtenerCeldaDia(d.dia);
              @let cfgMio = obtenerConfigTurno(celdaMia?.codigo || '');
              @let srvDia = obtenerServicioDiaPortal(celdaMia, portal.empleado.servicioBaseId);
              <div
                class="emp-day-card"
                role="button"
                tabindex="0"
                [attr.aria-pressed]="diaPermutaSeleccionado === d.dia"
                [attr.aria-label]="'Día ' + d.dia + ' de ' + nombreMesSeleccionado + (celdaMia?.codigo ? ', turno ' + celdaMia?.codigo : ', sin turno')"
                [class.selected-day]="diaPermutaSeleccionado === d.dia"
                [class.today-card]="!!d.esHoy"
                [class.sat-card]="d.esSabado"
                [class.sun-card]="d.esDomingo"
                [class.holiday-card]="!!d.festivo"
                [class.support-card]="srvDia?.esRotacion"
                [class.pinned-card]="!!celdaMia?.fijada"
                (click)="seleccionarDiaEnPortal.emit(d.dia)"
                (contextmenu)="onCardContextMenu($event, d.dia)"
                (keydown.f2)="$event.preventDefault(); $event.stopPropagation(); abrirInspectorDiaPortal.emit(d.dia)"
                (keydown.enter)="seleccionarDiaEnPortal.emit(d.dia)"
                (keydown.space)="$event.preventDefault(); seleccionarDiaEnPortal.emit(d.dia)">
                <div class="emp-day-head">
                  <span class="emp-day-num">
                    {{ d.dia }}
                    @if (d.esHoy) {
                      <span class="emp-hoy-tag">Hoy</span>
                    }
                  </span>
                  <div class="emp-day-head-tags">
                    @if ((celdaMia?.horasAdicionalesAprobadas || 0) > 0) {
                      <span class="emp-extra-tag" [title]="'+' + celdaMia?.horasAdicionalesAprobadas + 'h adicionales aprobadas'">
                        +{{ celdaMia?.horasAdicionalesAprobadas }}h⚡
                      </span>
                    } @else if ((celdaMia?.solicitudesPendientesCount || 0) > 0) {
                      <span class="emp-extra-pend-tag" title="Reporte de tiempo adicional en revisión">⏳</span>
                    }
                    @if (d.festivo) {
                      <span class="emp-festivo-tag" [title]="d.festivo.nombre">🇨🇴 Festivo</span>
                    }
                    @if (srvDia?.esRotacion) {
                      <span class="emp-rot-tag" title="Personal de apoyo en otro servicio">🔄 Apoyo</span>
                    }
                    @if (celdaMia?.fijada) {
                      <span class="emp-pin-tag" title="📌 Turno fijado por coordinación">📌</span>
                    }
                    <button
                      type="button"
                      class="btn-emp-day-info"
                      [attr.aria-label]="'Ver detalle e historial del día ' + d.dia"
                      title="Ver detalle e historial (F2 o clic derecho)"
                      (click)="onInfoDiaClick($event, d.dia)">
                      ℹ️
                    </button>
                  </div>
                </div>

                @if (celdaMia && celdaMia.codigo) {
                  <div
                    class="emp-shift-pill"
                    [style.background-color]="cfgMio ? cfgMio.bgHex : '#f8fafc'"
                    [style.color]="cfgMio ? cfgMio.textHex : '#64748b'"
                    [style.border-color]="cfgMio ? cfgMio.borderHex : '#cbd5e1'">
                    <span class="emp-day-code">{{ celdaMia.codigo }}</span>
                    <span class="emp-day-name">{{ cfgMio ? cfgMio.nombre : celdaMia.codigo }}</span>
                  </div>

                  <div class="emp-day-hours">
                    {{ cfgMio ? cfgMio.horario : 'Turno asignado' }}
                  </div>

                  @let brkDia = obtenerBreakPortal(celdaMia, cfgMio);
                  @if (brkDia) {
                    <div
                      class="emp-day-break"
                      [class.is-paid]="brkDia.remunerado"
                      [title]="'Break ' + brkDia.etiqueta + ': ' + brkDia.inicio + '–' + brkDia.fin + ' (' + (brkDia.remunerado ? 'Pagado' : 'No computable Art. 167 CST') + ')'">
                      🍽️ {{ brkDia.etiqueta }} · {{ brkDia.inicio }}–{{ brkDia.fin }}@if (brkDia.remunerado) { · ☕}
                    </div>
                  }

                  @if (srvDia) {
                    <div class="emp-day-service" [class.srv-rotado]="srvDia.esRotacion" [title]="'Servicio asignado: ' + srvDia.nombre">
                      <span class="srv-icon">{{ srvDia.esRotacion ? '🔄' : '📍' }}</span>
                      <span class="srv-text">{{ srvDia.nombre }}</span>
                    </div>
                  }
                } @else {
                  <div class="emp-shift-unassigned">
                    <span class="unassigned-dash">—</span>
                    <span class="unassigned-text">Sin turno</span>
                  </div>
                }

                @if (celdaMia?.nota) {
                  <div class="emp-day-nota" [title]="celdaMia?.nota || ''">
                    💬 {{ celdaMia?.nota }}
                  </div>
                }
              </div>
            }

            <!-- Celdas vacías al final del mes para cerrar la última fila semanal -->
            @for (slotFin of celdasOffsetFinMes; track slotFin; let idxFin = $index) {
              @let colIdx = (celdasOffsetInicioMes.length + diasDelMes.length + idxFin) % 7;
              <div
                class="emp-day-card empty-slot"
                [class.sat-card]="colIdx === 5"
                [class.sun-card]="colIdx === 6"
                aria-hidden="true">
              </div>
            }
          </div>

          <!-- Ficha Inteligente del Día Seleccionado en Modo Cuadrícula -->
          @let diaSelInfo = obtenerInfoDiaSeleccionado();
          @let ctrlExtraSel = diaSelInfo.columna ? evaluarControlTiempoAdicional(diaSelInfo.columna) : null;
          <div class="dia-seleccionado-ficha">
            <div class="ficha-header">
              <div class="ficha-title-block">
                <span class="ficha-day-badge">📌 Día {{ diaPermutaSeleccionado }} de {{ nombreMesSeleccionado }}</span>
                @if (diaSelInfo.festivo) {
                  <span class="badge-custom">🇨🇴 Festivo: {{ diaSelInfo.festivo.nombre }}</span>
                }
                @if (diaSelInfo.esHoy) {
                  <span class="badge-law">📍 Hoy</span>
                }
                @if ((diaSelInfo.celda?.horasAdicionalesAprobadas || 0) > 0) {
                  <span class="badge-extra-aprobada">
                    +{{ diaSelInfo.celda?.horasAdicionalesAprobadas }}h ⚡ Aprobadas
                  </span>
                }
              </div>
              <div class="ficha-actions">
                @if (ctrlExtraSel?.habilitado) {
                  <button
                    type="button"
                    class="btn-extra-ficha"
                    [class.is-disp]="ctrlExtraSel?.tipo === 'DISPONIBILIDAD_LLAMADO'"
                    (click)="abrirModalTiempoAdicional($event, diaPermutaSeleccionado)"
                    [title]="ctrlExtraSel?.titulo || ''">
                    {{ ctrlExtraSel?.etiquetaLargo }}
                  </button>
                } @else if (ctrlExtraSel?.motivoBloqueo) {
                  <span class="ficha-extra-blocked" [title]="ctrlExtraSel?.motivoBloqueo || ''">
                    🔒 {{ ctrlExtraSel?.motivoBloqueo }}
                  </span>
                }
                @if (diaSelInfo.celda?.codigo && diaSelInfo.celda?.codigo !== 'L') {
                  <button
                    type="button"
                    class="btn-tool"
                    (click)="abrirInspectorDiaPortal.emit(diaPermutaSeleccionado)"
                    title="Ver historial de cambios de este día">
                    ℹ️ Historial / Auditoría
                  </button>
                }
              </div>
            </div>

            <div class="ficha-body">
              @if (diaSelInfo.celda && diaSelInfo.celda.codigo && diaSelInfo.celda.codigo !== 'L') {
                <div class="ficha-shift-card" [style.border-color]="diaSelInfo.cfg?.borderHex || '#cbd5e1'">
                  <div class="ficha-shift-top">
                    <span
                      class="ficha-shift-code"
                      [style.background-color]="diaSelInfo.cfg?.bgHex || '#f1f5f9'"
                      [style.color]="diaSelInfo.cfg?.textHex || '#0f172a'">
                      {{ diaSelInfo.celda.codigo }} · {{ diaSelInfo.cfg?.nombre || diaSelInfo.celda.codigo }}
                    </span>
                    <span class="ficha-shift-hours">⏰ Horario: <strong>{{ diaSelInfo.cfg?.horario }}</strong></span>
                  </div>
                  <div class="ficha-shift-details">
                    <span>🏥 Servicio: <strong>{{ diaSelInfo.servicio?.nombre || 'Servicio Hospitalario' }}</strong></span>
                    @if (diaSelInfo.brk) {
                      <span>🍽️ Break: <strong>{{ diaSelInfo.brk.etiqueta }} ({{ diaSelInfo.brk.inicio }} a {{ diaSelInfo.brk.fin }})</strong></span>
                    }
                    @if (diaSelInfo.celda.nota) {
                      <span>💬 Nota: <em>{{ diaSelInfo.celda.nota }}</em></span>
                    }
                  </div>
                </div>
              } @else if (diaSelInfo.celda?.codigo === 'L') {
                <div class="ficha-free-card">
                  <span>🏖️ <strong>Día de Descanso Programado (Libre)</strong> · Disfrute de descanso semanal</span>
                </div>
              } @else {
                <div class="ficha-unassigned-card">
                  <span>⚪ <strong>Sin turno programado para este día</strong></span>
                </div>
              }
              @if (diaSelInfo.celda?.tramosAdicionales && diaSelInfo.celda!.tramosAdicionales!.length > 0) {
                <div class="ficha-extra-tramos">
                  @for (tr of diaSelInfo.celda!.tramosAdicionales!; track tr.id) {
                    <div class="ficha-extra-tramo-item">
                      <strong>⚡ Tiempo adicional aprobado (+{{ tr.horasAprobadas }}h):</strong>
                      <span>Franja {{ tr.horaInicio }}–{{ tr.horaFin }} • [{{ tr.motivoCategoria }}] {{ tr.motivoDetalle }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }
        </div>

        <!-- Bloque 3 y 4: Solicitar Cambio de Turno y Ver Equipo de Guardia -->
        <div class="two-col-panels">
          <!-- Intercambio de turnos entre compañeros (Doc 09) -->
          <div class="panel-card">
            <div class="panel-header">
              <h3>🔄 Solicitar Cambio de Turno — Día {{ diaPermutaSeleccionado }}</h3>
              <span class="badge-law">{{ portal.empleado.categoria }}</span>
            </div>

            <!-- 1. BLOQUE DE PROPUESTAS RECIBIDAS (ACCIÓN REQUERIDA DEL COMPAÑERO RECEPTOR) -->
            @if (propuestasRecibidas.length > 0) {
              <div class="propuestas-recibidas-alert">
                <div class="alert-incoming-header">
                  <strong>📬 Propuestas de Cambio Recibidas:</strong>
                  <span class="badge-count-pending">{{ propuestasRecibidas.length }} por responder</span>
                </div>
                <div class="permutas-list portal-permutas-incoming-list">
                  @for (pr of propuestasRecibidas; track pr.id) {
                    <div class="permuta-item permuta-item-incoming">
                      <div class="permuta-main">
                        <div class="permuta-title">
                          <strong>{{ pr.solicitanteNombre }}</strong> te propone intercambiar:
                        </div>
                        <div class="permuta-meta">
                          Día {{ pr.diaOrigen }} ({{ formatearPeriodoPermuta(pr.mes, pr.anio) }}): Su turno <code>{{ pr.turnoOrigen }}</code> por tu turno <code>{{ pr.turnoDestino }}</code>
                        </div>
                        <div class="permuta-validation">
                          ✅ {{ pr.validacionReglas }}
                        </div>
                      </div>
                      <div class="permuta-actions">
                        <button type="button" class="btn-approve" (click)="aceptarPropuestaPar.emit(pr.id)">
                          ✅ Aceptar Propuesta
                        </button>
                        <button type="button" class="btn-reject" (click)="rechazarPropuestaPar.emit(pr.id)">
                          ❌ Declinar
                        </button>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            @let celdaDiaPerm = obtenerCeldaDia(diaPermutaSeleccionado);
            @let cfgDiaPerm = obtenerConfigTurno(celdaDiaPerm?.codigo || '');
            @let esAusenciaDiaPerm = !!(cfgDiaPerm?.esAusencia || esAusenciaCodigo(celdaDiaPerm?.codigo));
            @let turnoBloqueadoPerm = !!(cfgDiaPerm?.bloqueaPermutas && !esAusenciaDiaPerm);
            <p class="panel-desc portal-turno-dia-desc">
              <span>Tu turno el <strong>Día {{ diaPermutaSeleccionado }} de {{ nombreMesSeleccionado }}</strong>:</span>
              @if (celdaDiaPerm?.codigo) {
                <span class="mini-shift">{{ celdaDiaPerm?.codigo }}</span>
                <span class="badge-srv-panel" [class.badge-srv-rot]="servicioDiaSeleccionado.esRotacion" [title]="servicioDiaSeleccionado.esRotacion ? 'Servicio de apoyo rotado' : 'Servicio base asignado'">
                  {{ servicioDiaSeleccionado.esRotacion ? '🔄 ' : '📍 ' }}{{ servicioDiaSeleccionado.nombre }}
                </span>
              } @else {
                <span class="badge-srv-panel badge-srv-unassigned">Sin turno asignado</span>
              }
            </p>

            <div class="form-stack">
              <label for="portal-companero-select">
                Proponer cambio de turno a un compañero el Día {{ diaPermutaSeleccionado }} de {{ nombreMesSeleccionado }}:
              </label>
              @if (estadoCuadrante !== 'PUBLICADO') {
                <div class="portal-notice-box">
                  🔒 <strong>Permutas no disponibles:</strong> Solo se pueden tramitar solicitudes de intercambio de turnos cuando el cuadrante del mes se encuentra <strong>PUBLICADO</strong> oficialmente. Estado actual de {{ nombreMesSeleccionado }}: <em>{{ estadoCuadrante === 'BORRADOR' ? 'En Borrador' : (estadoCuadrante === 'CERRADO_NOMINA' ? 'Cerrado para Nómina' : 'Sin Planificar') }}</em>.
                </div>
              } @else if (!celdaDiaPerm?.codigo) {
                <div class="portal-notice-box">
                  ℹ️ <strong>Día sin turno asignado:</strong> No tienes un turno programado en el Día {{ diaPermutaSeleccionado }}. Solo puedes permutar días en los que tengas un turno oficial asignado.
                </div>
              } @else if (esAusenciaDiaPerm) {
                <div class="portal-notice-danger">
                  🔒 <strong>Novedad Oficial Intranet ({{ celdaDiaPerm?.codigo }}):</strong> Los días con Vacaciones, Incapacidad, Licencia o Día de la Familia están bloqueados y no admiten permutas.
                </div>
              } @else if (turnoBloqueadoPerm) {
                <div class="portal-notice-danger">
                  🔒 <strong>Turno restringido para intercambio ({{ celdaDiaPerm?.codigo }}):</strong> Este tipo de turno está configurado en catálogo para bloquear permutas entre compañeros.
                </div>
              } @else if (celdaDiaPerm?.fijada) {
                <div class="portal-notice-danger">
                  📌 <strong>Celda fijada por coordinación ({{ celdaDiaPerm?.codigo }}):</strong> Este turno está protegido temporalmente por supervisión y no admite propuestas de permuta.
                </div>
              } @else if (companerosPares.length > 0) {
                <select
                  id="portal-companero-select"
                  class="portal-par-select"
                  [ngModel]="companeroPermutaId"
                  (ngModelChange)="cambiarCompaneroPermuta.emit($event)">
                  @for (par of companerosPares; track par.id) {
                    @let turnoPar = obtenerTurnoAsignadoEmpleado(par.id, diaPermutaSeleccionado);
                    <option [value]="par.id">
                      {{ par.nombre }} ({{ par.categoria }}) — Turno {{ turnoPar ? '[' + turnoPar + ']' : '[Sin turno]' }} el Día {{ diaPermutaSeleccionado }}
                    </option>
                  }
                </select>

                <button type="button" class="btn-primary" (click)="enviarSolicitudPermuta.emit()">
                  📨 Enviar Propuesta a Compañero (Paso 1)
                </button>
              } @else {
                <div class="text-muted portal-no-pares">
                  No hay compañeros habilitados con cargo compatible en este servicio para realizar permutas.
                </div>
              }
            </div>

            <div class="portal-sent-section">
              <h4 class="portal-sent-heading">Estado de Mis Solicitudes Enviadas:</h4>
              <div class="permutas-list">
                @for (mp of misSolicitudesEnviadas; track mp.id) {
                  <div class="permuta-item">
                    <div>
                      <div class="permuta-title">
                        Día {{ mp.diaOrigen }} ({{ formatearPeriodoPermuta(mp.mes, mp.anio) }}): Tu turno <code>{{ mp.turnoOrigen }}</code> ⇄ Turno <code>{{ mp.turnoDestino }}</code> con <strong>{{ mp.receptorNombre }}</strong>
                      </div>
                      <div class="permuta-validation">{{ mp.validacionReglas }}</div>
                      @if (mp.motivoRechazo) {
                        <div class="permuta-reject-reason">Motivo: {{ mp.motivoRechazo }}</div>
                      }
                    </div>
                    <div>
                      @if (mp.estado === 'PENDIENTE_PAR') {
                        <span class="status-tag status-tag-par" title="Esperando que tu compañero acepte la propuesta">⏳ Esperando a {{ mp.receptorNombre }}</span>
                      } @else if (mp.estado === 'PENDIENTE_SUPERVISOR') {
                        <span class="status-tag status-tag-sup" title="Aceptada por tu compañero; esperando aprobación de la Supervisora">📋 En revisión Jefatura</span>
                      } @else if (mp.estado === 'APROBADA') {
                        <span class="status-tag status-tag-ok" title="Aprobada y aplicada en el cuadrante">✅ Aprobada</span>
                      } @else {
                        <span class="status-tag status-tag-no" title="Rechazada">❌ Rechazada</span>
                      }
                    </div>
                  </div>
                } @empty {
                  <div class="text-muted">No has enviado propuestas de cambio en este periodo.</div>
                }
              </div>
            </div>

            <!-- Sección de Mis Reportes de Tiempo Adicional / Llamados DISP -->
            <div class="portal-sent-section">
              <div class="portal-sent-header-row">
                <h4 class="portal-sent-heading">⏰ Mis Reportes de Tiempo Adicional / Llamados DISP:</h4>
                @let colDiaActual = obtenerColumnaDia(diaPermutaSeleccionado);
                @let ctrlExtraPanel = colDiaActual ? evaluarControlTiempoAdicional(colDiaActual) : null;
                @if (ctrlExtraPanel?.habilitado) {
                  <button
                    type="button"
                    class="btn-extra-ficha"
                    [class.is-disp]="ctrlExtraPanel?.tipo === 'DISPONIBILIDAD_LLAMADO'"
                    (click)="abrirModalTiempoAdicional($event, diaPermutaSeleccionado)">
                    {{ ctrlExtraPanel?.etiquetaLargo }} (Día {{ diaPermutaSeleccionado }})
                  </button>
                }
              </div>
              <div class="permutas-list">
                @for (st of misSolicitudesTiempoAdicional; track st.id) {
                  <div class="permuta-item">
                    <div>
                      <div class="permuta-title">
                        Día {{ st.dia }} ({{ formatearPeriodoPermuta(st.mes, st.anio) }}) · Turno base <code>{{ st.turnoBase }}</code>:
                        <strong>{{ st.horaInicio }}–{{ st.horaFin }}</strong>
                        (+{{ st.horasAprobadas ?? st.horasCalculadas }}h)
                      </div>
                      <div class="permuta-validation">
                        [{{ st.motivoCategoria }}] {{ st.motivoDetalle }}
                        @if (st.soporteClinico) {
                          <span> • Soporte: <b>{{ st.soporteClinico }}</b></span>
                        }
                      </div>
                      @if (st.observacionSupervisor) {
                        <div class="permuta-meta">Nota Supervisión: {{ st.observacionSupervisor }}</div>
                      }
                      @if (st.motivoRechazo) {
                        <div class="permuta-reject-reason">Motivo rechazo: {{ st.motivoRechazo }}</div>
                      }
                    </div>
                    <div>
                      @if (st.estado === 'PENDIENTE_SUPERVISOR') {
                        <span class="status-tag status-tag-sup">⏳ En revisión Jefatura</span>
                      } @else if (st.estado === 'APROBADA') {
                        <span class="status-tag status-tag-ok">✅ Aprobada (+{{ st.horasAprobadas ?? st.horasCalculadas }}h ⚡)</span>
                      } @else {
                        <span class="status-tag status-tag-no">❌ Rechazada</span>
                      }
                    </div>
                  </div>
                } @empty {
                  <div class="text-muted">No has registrado reportes de horas extras o llamados de disponibilidad en este mes.</div>
                }
              </div>
            </div>
          </div>

          <!-- ¿Quién está de turno conmigo ese día? -->
          <div class="panel-card">
            <div class="panel-header">
              <h3>🏥 Compañeros de Turno — Día {{ diaPermutaSeleccionado }} ({{ servicioDiaSeleccionado.nombre || 'Servicio' }})</h3>
            </div>

            <table class="data-table">
              <thead>
                <tr>
                  <th>Compañero</th>
                  <th>Cargo</th>
                  <th>Turno</th>
                  <th>Horario</th>
                  <th>Break</th>
                </tr>
              </thead>
              <tbody>
                @for (eq of equipoDeGuardiaDia; track eq.empleado.id) {
                  @let cfgEq = obtenerConfigTurno(eq.turno);
                  @let brkEq = obtenerBreakPortal(eq.celda, cfgEq);
                  <tr>
                    <td><strong>{{ eq.empleado.nombre }}</strong></td>
                    <td>{{ eq.empleado.categoria }}</td>
                    <td>
                      <span class="mini-shift" [style.background-color]="cfgEq?.bgHex" [style.color]="cfgEq?.textHex">
                        {{ eq.turno }} — {{ cfgEq?.nombre }}
                      </span>
                    </td>
                    <td class="font-mono">{{ cfgEq?.horario }}</td>
                    <td>
                      @if (brkEq) {
                        <span
                          class="portal-break-pill"
                          [class.is-paid]="brkEq.remunerado"
                          [title]="brkEq.remunerado ? 'Break pagado' : 'No computable Art. 167 CST'">
                          🍽️ {{ brkEq.etiqueta }} · {{ brkEq.inicio }}–{{ brkEq.fin }}
                        </span>
                      } @else {
                        <span class="text-muted">—</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="text-muted table-empty-cell">No hay otros compañeros en turno activo este día.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- MODAL INTERACTIVO: REPORTAR HORA EXTRA O LLAMADO EN DISPONIBILIDAD (MODELO B) -->
      @if (modalTiempoAdicionalAbierto()) {
        <div class="modal-backdrop" (click)="cerrarModalTiempoAdicional()">
          <div
            class="modal-box extra-modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-extra-title"
            (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3 id="modal-extra-title">
                @if (tipoExtraModal() === 'DISPONIBILIDAD_LLAMADO') {
                  🚨 Reportar Atención Presencial por Llamado (DISP)
                } @else if (tipoExtraModal() === 'GUARDIA_EXTRAORDINARIA') {
                  ⚡ Reportar Guardia Extraordinaria Asistida
                } @else {
                  ⏰ Reportar Prolongación de Turno / Tiempo Adicional
                }
              </h3>
              <button type="button" class="btn-close-modal" aria-label="Cerrar diálogo" (click)="cerrarModalTiempoAdicional()">✕</button>
            </div>

            <div class="modal-body extra-modal-body">
              <div class="extra-modal-context-bar">
                <span>📅 <strong>Día {{ diaExtraModal() }} de {{ nombreMesSeleccionado }} {{ anioSeleccionado }}</strong></span>
                <span>Turno en Cuadrante: <code>{{ turnoBaseExtraModal() }}</code></span>
              </div>

              <div class="extra-modal-legal-info">
                ⚖️ <strong>Liquidación Automática (Modelo B — Meta Mensual):</strong>
                Una vez validado por tu Coordinador de Servicio, este tiempo se suma a tus horas trabajadas del mes. Si tienes déficit frente a tu meta mensual, nivela tu jornada ordinaria; todo lo que supere tu meta mensual se liquida automáticamente con los recargos CST de ley (+25% diurno, +75% nocturno o festivo).
              </div>

              <div class="extra-time-grid">
                <div class="extra-form-field">
                  <label for="extra-hora-inicio">Hora Inicio Real:</label>
                  <input
                    id="extra-hora-inicio"
                    type="time"
                    class="extra-input"
                    [ngModel]="horaInicioExtra()"
                    (ngModelChange)="horaInicioExtra.set($event)" />
                </div>
                <div class="extra-form-field">
                  <label for="extra-hora-fin">Hora Fin Real:</label>
                  <input
                    id="extra-hora-fin"
                    type="time"
                    class="extra-input"
                    [ngModel]="horaFinExtra()"
                    (ngModelChange)="horaFinExtra.set($event)" />
                </div>
                <div class="extra-duration-box" [class.is-invalid]="horasCalculadasModal <= 0 || horasCalculadasModal > 12">
                  <span class="extra-dur-label">Duración Efectiva</span>
                  <strong class="extra-dur-val">{{ horasCalculadasModal > 0 ? '+' + horasCalculadasModal + ' h' : 'Inválida' }}</strong>
                </div>
              </div>

              <div class="extra-form-field">
                <label for="extra-motivo-cat">Motivo Asistencial Justificado (Obligatorio):</label>
                <select
                  id="extra-motivo-cat"
                  class="extra-input"
                  [ngModel]="motivoCategoriaExtra()"
                  (ngModelChange)="motivoCategoriaExtra.set($event)">
                  <option value="CIRUGIA_URGENCIA">Cirugía de urgencia / Laparotomía / Trauma en Quirófano</option>
                  <option value="CESAREA_URGENCIA">Cesárea de urgencia / Código Rojo Ginecoobstétrico</option>
                  <option value="CODIGO_AZUL_REANIMACION">Entrega de guardia tardía por Reanimación / Código Azul</option>
                  <option value="SOBREDEMANDA_URGENCIAS">Contingencia por sobredemanda crítica en el servicio</option>
                  <option value="RELEVO_TARDIO">Relevo asistencial no se presentó a tiempo</option>
                  <option value="OTRO_ASISTENCIAL">Otro procedimiento asistencial no diferible</option>
                </select>
              </div>

              <div class="extra-form-field">
                <label for="extra-motivo-det">Descripción Clínica / Procedimiento Realizado (Obligatorio):</label>
                <textarea
                  id="extra-motivo-det"
                  rows="2"
                  class="extra-input extra-textarea"
                  placeholder="Ej: Atención de código rojo obstétrico en Quirófano 2..."
                  [ngModel]="motivoDetalleExtra()"
                  (ngModelChange)="motivoDetalleExtra.set($event)"></textarea>
              </div>

              <div class="extra-form-field">
                <label for="extra-soporte">Soporte Clínico de Verificación (Folio HC / Quirófano / Cama — Opcional):</label>
                <input
                  id="extra-soporte"
                  type="text"
                  class="extra-input"
                  placeholder="Ej: HC #849201 · Quirófano 2"
                  [ngModel]="soporteClinicoExtra()"
                  (ngModelChange)="soporteClinicoExtra.set($event)" />
              </div>

              @if (errorValidacionModalExtra()) {
                <div class="portal-notice-danger">
                  ⚠️ {{ errorValidacionModalExtra() }}
                </div>
              }

              <div class="extra-modal-footer">
                <button type="button" class="btn-outline" (click)="cerrarModalTiempoAdicional()">
                  Cancelar
                </button>
                <button
                  type="button"
                  class="btn-primary"
                  [disabled]="horasCalculadasModal <= 0 || horasCalculadasModal > 12 || motivoDetalleExtra().trim().length < 4"
                  (click)="confirmarEnvioTiempoAdicional()">
                  📨 Enviar a Supervisión ({{ horasCalculadasModal > 0 ? '+' + horasCalculadasModal + 'h' : '—' }})
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class PortalColaboradorComponent implements AfterViewInit, OnChanges {
  readonly modoVistaPortal = signal<'AGENDA' | 'MES'>(this.determinarModoInicial());

  // Estado reactivo del modal de Tiempo Adicional / Llamado DISP
  readonly modalTiempoAdicionalAbierto = signal<boolean>(false);
  readonly diaExtraModal = signal<number>(1);
  readonly turnoBaseExtraModal = signal<string>('L');
  readonly tipoExtraModal = signal<'HORA_EXTRA_PROLONGACION' | 'DISPONIBILIDAD_LLAMADO' | 'GUARDIA_EXTRAORDINARIA'>('HORA_EXTRA_PROLONGACION');
  readonly horaInicioExtra = signal<string>('15:00');
  readonly horaFinExtra = signal<string>('17:00');
  readonly motivoCategoriaExtra = signal<string>('CIRUGIA_URGENCIA');
  readonly motivoDetalleExtra = signal<string>('');
  readonly soporteClinicoExtra = signal<string>('');
  readonly errorValidacionModalExtra = signal<string>('');

  ngAfterViewInit(): void {
    if (this.modoVistaPortal() === 'AGENDA') {
      this.desplazarAlDiaActualEnAgenda('auto');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['diasDelMes'] && this.modoVistaPortal() === 'AGENDA') {
      this.desplazarAlDiaActualEnAgenda('smooth');
    }
  }

  private determinarModoInicial(): 'AGENDA' | 'MES' {
    if (typeof window !== 'undefined') {
      try {
        const guardado = localStorage.getItem('rafa_portal_vista_modo');
        if (guardado === 'AGENDA' || guardado === 'MES') return guardado;
      } catch {}
      if (window.innerWidth < 768) return 'AGENDA';
    }
    return 'MES';
  }

  cambiarModoVista(modo: 'AGENDA' | 'MES'): void {
    this.modoVistaPortal.set(modo);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('rafa_portal_vista_modo', modo);
      } catch {}
      if (modo === 'AGENDA') {
        this.desplazarAlDiaActualEnAgenda('smooth');
      }
    }
  }

  desplazarAlDiaActualEnAgenda(behavior: ScrollBehavior = 'smooth'): void {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      const diaHoy = this.diasDelMes.find((d) => d.esHoy)?.dia;
      const targetDia = diaHoy || this.diaPermutaSeleccionado;
      const el =
        document.getElementById(`agenda-card-dia-${targetDia}`) ||
        document.querySelector('.agenda-day-card.today-card') ||
        document.querySelector('.agenda-day-card');
      if (el) {
        el.scrollIntoView({ behavior, block: 'start' });
      }
    }, 120);
  }

  obtenerInfoDiaSeleccionado(): {
    dia: number;
    columna?: DiaColumna;
    celda?: CeldaAsignacion;
    cfg?: TipoTurnoConfig;
    servicio?: { nombre: string; esRotacion: boolean } | null;
    brk?: { etiqueta: string; inicio: string; fin: string; remunerado: boolean } | null;
    festivo?: any;
    esHoy?: boolean;
  } {
    const dia = this.diaPermutaSeleccionado;
    const columna = this.diasDelMes.find((d) => d.dia === dia);
    const celda = this.obtenerCeldaDia(dia);
    const cfg = this.obtenerConfigTurno(celda?.codigo || '');
    const servicio = this.obtenerServicioDiaPortal(celda, this.portal?.empleado?.servicioBaseId);
    const brk = this.obtenerBreakPortal(celda, cfg);
    return {
      dia,
      columna,
      celda,
      cfg,
      servicio,
      brk,
      festivo: columna?.festivo,
      esHoy: columna?.esHoy,
    };
  }

  @Input({ required: true }) portal!: DatosEmpleadoPortal;
  @Input() esAdminTh = false;
  @Input() esCoordinador = false;
  @Input() estadoCuadrante: 'BORRADOR' | 'PUBLICADO' | 'CERRADO_NOMINA' | 'SIN_PLANIFICAR' = 'PUBLICADO';
  @Input() empleadoPortalId = '';
  @Input() empleados: EmpleadoHospital[] = [];
  @Input() rolActual: RolUsuarioSso = 'COLABORADOR';
  @Input() mesSeleccionado = Number(hoyColombiaIso().substring(5, 7));
  @Input() anioSeleccionado = Number(hoyColombiaIso().substring(0, 4));
  @Input() aniosDisponibles: number[] = [];
  @Input() esPeriodoActual = true;
  @Input() puedeIrAHoy = true;
  @Input() mesesDisponibles: Array<{ valor: number; nombre: string }> = [];
  @Input() diaPermutaSeleccionado = 1;
  @Input() celdasOffsetInicioMes: number[] = [];
  @Input() celdasOffsetFinMes: number[] = [];
  @Input() diasDelMes: DiaColumna[] = [];
  @Input() catalogoTurnosMap: Record<string, TipoTurnoConfig> = {};
  @Input() servicios: ServicioHospitalario[] = [];
  @Input() propuestasRecibidas: PermutaItem[] = [];
  @Input() servicioDiaSeleccionado: { id: string; nombre: string; esRotacion: boolean } = {
    id: '',
    nombre: 'Servicio Hospitalario',
    esRotacion: false,
  };
  @Input() companerosPares: EmpleadoHospital[] = [];
  @Input() companeroPermutaId = '';
  @Input() asignaciones: Record<string, Record<number, CeldaAsignacion>> = {};
  @Input() misSolicitudesEnviadas: PermutaItem[] = [];
  @Input() misSolicitudesTiempoAdicional: SolicitudTiempoAdicionalItem[] = [];
  @Input() equipoDeGuardiaDia: Array<{ empleado: EmpleadoHospital; turno: string; celda?: CeldaAsignacion }> = [];

  @Output() cambiarMes = new EventEmitter<number>();
  @Output() cambiarAnio = new EventEmitter<number>();
  @Output() irAMesActual = new EventEmitter<void>();
  @Output() cambiarEmpleadoPortal = new EventEmitter<string>();
  @Output() abrirModalIcal = new EventEmitter<void>();
  @Output() seleccionarDiaEnPortal = new EventEmitter<number>();
  @Output() aceptarPropuestaPar = new EventEmitter<string>();
  @Output() rechazarPropuestaPar = new EventEmitter<string>();
  @Output() cambiarCompaneroPermuta = new EventEmitter<string>();
  @Output() enviarSolicitudPermuta = new EventEmitter<void>();
  @Output() enviarSolicitudTiempoAdicional = new EventEmitter<{
    dia: number;
    turnoBase: string;
    tipo: 'HORA_EXTRA_PROLONGACION' | 'DISPONIBILIDAD_LLAMADO' | 'GUARDIA_EXTRAORDINARIA';
    horaInicio: string;
    horaFin: string;
    motivoCategoria: string;
    motivoDetalle: string;
    soporteClinico?: string;
  }>();
  @Output() abrirMenuContextualPortal = new EventEmitter<{
    dia: number;
    clientX: number;
    clientY: number;
  }>();
  @Output() abrirInspectorDiaPortal = new EventEmitter<number>();

  get horasCalculadasModal(): number {
    const durMin = duracionHorarioMin(this.horaInicioExtra(), this.horaFinExtra(), false);
    if (durMin === null || durMin < 15 || durMin > 12 * 60) return 0;
    return r2(durMin / 60);
  }

  obtenerColumnaDia(dia: number): DiaColumna | undefined {
    return this.diasDelMes.find((d) => d.dia === dia);
  }

  evaluarControlTiempoAdicional(d: DiaColumna): {
    habilitado: boolean;
    motivoBloqueo?: string;
    etiquetaCorto: string;
    etiquetaLargo: string;
    titulo: string;
    tipo: 'HORA_EXTRA_PROLONGACION' | 'DISPONIBILIDAD_LLAMADO' | 'GUARDIA_EXTRAORDINARIA';
  } {
    const celda = this.obtenerCeldaDia(d.dia);
    const cod = (celda?.codigo || 'L').trim().toUpperCase();
    const cfg = this.obtenerConfigTurno(cod);
    const tipo: 'HORA_EXTRA_PROLONGACION' | 'DISPONIBILIDAD_LLAMADO' | 'GUARDIA_EXTRAORDINARIA' =
      cod === 'DISP'
        ? 'DISPONIBILIDAD_LLAMADO'
        : cod === 'L' || cod === 'S' || !cod
          ? 'GUARDIA_EXTRAORDINARIA'
          : 'HORA_EXTRA_PROLONGACION';

    const etiquetaCorto =
      tipo === 'DISPONIBILIDAD_LLAMADO'
        ? '🚨 +Llamado'
        : tipo === 'GUARDIA_EXTRAORDINARIA'
          ? '⚡ +Guardia'
          : '⏰ +Extra';

    const etiquetaLargo =
      tipo === 'DISPONIBILIDAD_LLAMADO'
        ? '🚨 Reportar Llamado DISP'
        : tipo === 'GUARDIA_EXTRAORDINARIA'
          ? '⚡ Reportar Guardia Extra'
          : '⏰ Reportar Hora Extra';

    if (this.estadoCuadrante === 'CERRADO_NOMINA') {
      return {
        habilitado: false,
        motivoBloqueo: 'Periodo cerrado en Nómina',
        etiquetaCorto,
        etiquetaLargo,
        titulo: 'El periodo ya fue cerrado para nómina',
        tipo,
      };
    }
    if (this.estadoCuadrante !== 'PUBLICADO') {
      return {
        habilitado: false,
        motivoBloqueo: 'Cuadrante aún no publicado',
        etiquetaCorto,
        etiquetaLargo,
        titulo: 'Solo disponible en cuadrantes publicados',
        tipo,
      };
    }
    if (cfg?.esAusencia || this.esAusenciaCodigo(cod)) {
      return {
        habilitado: false,
        motivoBloqueo: `Día con ausencia oficial (${cod})`,
        etiquetaCorto,
        etiquetaLargo,
        titulo: 'No aplica en días de ausencia oficial',
        tipo,
      };
    }
    const hoyIso = hoyColombiaIso();
    if (d.fechaIso > hoyIso) {
      return {
        habilitado: false,
        motivoBloqueo: 'Disponible al cumplirse la fecha',
        etiquetaCorto,
        etiquetaLargo,
        titulo: 'Solo se habilita para el día actual o días pasados',
        tipo,
      };
    }

    return {
      habilitado: true,
      etiquetaCorto,
      etiquetaLargo,
      titulo:
        tipo === 'DISPONIBILIDAD_LLAMADO'
          ? 'Reportar atención presencial por llamado de urgencia en Disponibilidad'
          : 'Reportar tiempo adicional trabajado en este día',
      tipo,
    };
  }

  abrirModalTiempoAdicional(event: Event, dia: number): void {
    event.stopPropagation();
    this.seleccionarDiaEnPortal.emit(dia);
    const col = this.obtenerColumnaDia(dia);
    if (!col) return;
    const ctrl = this.evaluarControlTiempoAdicional(col);
    if (!ctrl.habilitado) return;

    const celda = this.obtenerCeldaDia(dia);
    const cod = (celda?.codigo || 'L').trim().toUpperCase();
    const cfg = this.obtenerConfigTurno(cod);

    this.diaExtraModal.set(dia);
    this.turnoBaseExtraModal.set(cod || 'L');
    this.tipoExtraModal.set(ctrl.tipo);
    this.errorValidacionModalExtra.set('');

    if (ctrl.tipo === 'DISPONIBILIDAD_LLAMADO') {
      this.horaInicioExtra.set('02:00');
      this.horaFinExtra.set('05:00');
      this.motivoCategoriaExtra.set('CIRUGIA_URGENCIA');
    } else if (cfg && cfg.horaFin && cfg.horaFin !== '00:00' && cfg.horaFin !== '23:59') {
      this.horaInicioExtra.set(cfg.horaFin);
      const [hStr, mStr] = cfg.horaFin.split(':');
      const hFinSugerida = (Number(hStr) + 2) % 24;
      this.horaFinExtra.set(`${String(hFinSugerida).padStart(2, '0')}:${mStr || '00'}`);
      this.motivoCategoriaExtra.set('CODIGO_AZUL_REANIMACION');
    } else {
      this.horaInicioExtra.set('14:00');
      this.horaFinExtra.set('17:00');
      this.motivoCategoriaExtra.set('SOBREDEMANDA_URGENCIAS');
    }

    this.motivoDetalleExtra.set('');
    this.soporteClinicoExtra.set('');
    this.modalTiempoAdicionalAbierto.set(true);
  }

  cerrarModalTiempoAdicional(): void {
    this.modalTiempoAdicionalAbierto.set(false);
    this.errorValidacionModalExtra.set('');
  }

  confirmarEnvioTiempoAdicional(): void {
    const hCalc = this.horasCalculadasModal;
    if (hCalc <= 0 || hCalc > 12) {
      this.errorValidacionModalExtra.set(
        'La franja horaria debe tener una duración válida entre 15 minutos y 12 horas.'
      );
      return;
    }
    const detalle = this.motivoDetalleExtra().trim();
    if (detalle.length < 4) {
      this.errorValidacionModalExtra.set(
        'Por favor describe brevemente el procedimiento o motivo clínico.'
      );
      return;
    }

    this.enviarSolicitudTiempoAdicional.emit({
      dia: this.diaExtraModal(),
      turnoBase: this.turnoBaseExtraModal(),
      tipo: this.tipoExtraModal(),
      horaInicio: this.horaInicioExtra(),
      horaFin: this.horaFinExtra(),
      motivoCategoria: this.motivoCategoriaExtra(),
      motivoDetalle: detalle,
      soporteClinico: this.soporteClinicoExtra().trim() || undefined,
    });
    this.cerrarModalTiempoAdicional();
  }

  onCardContextMenu(event: MouseEvent, dia: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.seleccionarDiaEnPortal.emit(dia);
    this.abrirMenuContextualPortal.emit({
      dia,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  onInfoDiaClick(event: MouseEvent, dia: number): void {
    event.stopPropagation();
    this.seleccionarDiaEnPortal.emit(dia);
    this.abrirInspectorDiaPortal.emit(dia);
  }

  get nombreMesSeleccionado(): string {
    const mesObj = this.mesesDisponibles.find((m) => m.valor === this.mesSeleccionado);
    if (mesObj) return mesObj.nombre;
    const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return nombres[this.mesSeleccionado - 1] || `Mes ${this.mesSeleccionado}`;
  }

  get puedeRetrocederMes(): boolean {
    if (this.mesesDisponibles.length <= 1) return false;
    const idx = this.mesesDisponibles.findIndex((m) => m.valor === this.mesSeleccionado);
    return idx > 0;
  }

  get puedeAvanzarMes(): boolean {
    if (this.mesesDisponibles.length <= 1) return false;
    const idx = this.mesesDisponibles.findIndex((m) => m.valor === this.mesSeleccionado);
    return idx >= 0 && idx < this.mesesDisponibles.length - 1;
  }

  get mesAnteriorNombre(): string {
    const idx = this.mesesDisponibles.findIndex((m) => m.valor === this.mesSeleccionado);
    if (idx > 0) return this.mesesDisponibles[idx - 1].nombre;
    return 'Anterior';
  }

  get mesSiguienteNombre(): string {
    const idx = this.mesesDisponibles.findIndex((m) => m.valor === this.mesSeleccionado);
    if (idx >= 0 && idx < this.mesesDisponibles.length - 1) return this.mesesDisponibles[idx + 1].nombre;
    return 'Siguiente';
  }

  retrocederMes(): void {
    const idx = this.mesesDisponibles.findIndex((m) => m.valor === this.mesSeleccionado);
    if (idx > 0) {
      this.cambiarMes.emit(this.mesesDisponibles[idx - 1].valor);
    }
  }

  avanzarMes(): void {
    const idx = this.mesesDisponibles.findIndex((m) => m.valor === this.mesSeleccionado);
    if (idx >= 0 && idx < this.mesesDisponibles.length - 1) {
      this.cambiarMes.emit(this.mesesDisponibles[idx + 1].valor);
    }
  }

  construirTooltipMetaPortal(): string {
    const p = this.portal as any;
    const empNom = p?.empresaNombre || p?.empleado?.empresaContratante?.nombre || 'Régimen Contractual';
    const hSem = p?.horasSemanalesAplicadas ?? p?.empleado?.horasSemanalesAplicadas ?? 42;
    const dhMes = p?.diasHabilesMes ?? '—';
    const nom = p?.horasContratadasNominales ?? p?.empleado?.horasContratoMes ?? 0;
    const ef = p?.horasContratadasEfectivas ?? nom;
    const dhPror = p?.diasHabilesProrrateados ?? p?.diasExonerados ?? 0;
    const exoneradas = p?.horasExoneradas ?? 0;
    const base = `${empNom} (${hSem}h/sem)\nDías hábiles mes: ${dhMes} d.h. → Meta nominal: ${nom}h`;
    if (dhPror > 0) {
      return `${base}\nProrrateo por días hábiles exonerados: -${dhPror} d.h. (-${exoneradas}h) → Meta efectiva: ${ef}h`;
    }
    return base;
  }

  formatearSigno(n?: number): string {
    const val = Number(n) || 0;
    return (val > 0 ? '+' : '') + val;
  }

  etiquetaRol(rol?: RolUsuarioSso): string {
    if (rol === 'ADMIN_TH') return 'Talento Humano / Admin';
    if (rol === 'COORDINADOR') return 'Coordinador de Servicio';
    return 'Colaborador Asistencial';
  }

  obtenerConfigTurno(codigo: string): TipoTurnoConfig | undefined {
    return this.catalogoTurnosMap[codigo];
  }

  obtenerCeldaDia(dia: number): CeldaAsignacion | undefined {
    return this.portal?.celdas?.[dia];
  }

  obtenerTurnoAsignadoEmpleado(empId: string, dia: number): string | undefined {
    return this.asignaciones[empId]?.[dia]?.codigo;
  }

  esAusenciaCodigo(cod?: string): boolean {
    return esCodigoExoneracionContrato(cod);
  }

  formatearPeriodoPermuta(mes?: number | null, anio?: number | null): string {
    const m = Number(mes ?? this.mesSeleccionado);
    const a = Number(anio ?? this.anioSeleccionado);
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${nombres[m - 1] || `M${m}`} ${a}`;
  }

  obtenerServicioDiaPortal(celda?: CeldaAsignacion, srvBaseId?: string): {
    nombre: string;
    esRotacion: boolean;
  } | null {
    if (!celda || !celda.codigo || celda.codigo === 'L') return null;
    const cfg = this.catalogoTurnosMap[celda.codigo];
    if (!cfg || cfg.horasOrdinarias <= 0 || cfg.esAusencia) return null;

    const srvEjeId = celda.servicioEjecutorId || srvBaseId;
    const servicio = this.servicios.find((s) => s.id === srvEjeId);
    const esRotacion = Boolean(
      celda.esRotacion || (celda.servicioEjecutorId && celda.servicioEjecutorId !== srvBaseId)
    );

    return {
      nombre: servicio?.nombre || 'Servicio Hospitalario',
      esRotacion,
    };
  }

  obtenerBreakPortal(
    celda?: CeldaAsignacion,
    cfg?: TipoTurnoConfig
  ): { etiqueta: string; inicio: string; fin: string; remunerado: boolean } | null {
    if (!celda?.codigo || !cfg || !cfg.recesoHabilitado || cfg.esAusencia) return null;
    const tandas = obtenerTandasBreakDeTurno(cfg);
    if (tandas.length === 0) return null;
    const orden = celda.breakTandaOrden ?? tandas[0].orden;
    const tMatch = tandas.find((t) => t.orden === orden) || tandas[0];
    return {
      etiqueta: tMatch.etiqueta || `T${tMatch.orden}`,
      inicio: celda.breakInicio || tMatch.inicio,
      fin: celda.breakFin || tMatch.fin,
      remunerado: Boolean(cfg.recesoRemunerado),
    };
  }
}
