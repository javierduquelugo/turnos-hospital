import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PortalColaboradorComponent, DatosEmpleadoPortal } from './portal-colaborador.component';
import { DiaColumna, EmpleadoHospital } from '../../models';
import { calcularMetricasMesColaborador } from '../../calculo-turnos.helper';

describe('PortalColaboradorComponent (Selector de Vista y Modo Responsive)', () => {
  let component: PortalColaboradorComponent;
  let fixture: ComponentFixture<PortalColaboradorComponent>;

  const mockEmpleado: EmpleadoHospital = {
    id: 'emp-1',
    nombre: 'Dra. Elena Ramos',
    documento: '1098765432',
    categoria: 'Médico General',
    servicioBaseId: 'srv-urg',
    saldoBancoAnterior: 4,
    horasContratoMes: 168,
    ultimoTurnoMesPrevio: 'L',
  };

  const mockPortal: DatosEmpleadoPortal = {
    empleado: mockEmpleado,
    servicioBase: {
      id: 'srv-urg',
      codigo: 'URG',
      nombre: 'Urgencias Adultos',
      tipoAsistencia: 'URGENCIAS',
      reqDia: 2,
      reqNoche: 2,
      reqDiaDomFest: 2,
      reqNocheDomFest: 2,
      turnosHabilitados: ['M8', 'T8', 'N12', 'L'],
    },
    celdas: {
      1: { codigo: 'M8', esRotacion: false, fijada: false },
      2: { codigo: 'L', esRotacion: false, fijada: false },
    },
    horasTrabajadas: 8,
    conteoNoches: 0,
    conteoDomFest: 0,
    nuevoSaldoBanco: 4,
    diferenciaMes: 0,
  };

  const mockDias: DiaColumna[] = [
    { dia: 1, fechaIso: '2026-11-01', letraDia: 'L', esDomingo: false, esSabado: false, esHoy: true },
    { dia: 2, fechaIso: '2026-11-02', letraDia: 'M', esDomingo: false, esSabado: false, esHoy: false },
  ];

  beforeEach(async () => {
    localStorage.removeItem('rafa_portal_vista_modo');
    await TestBed.configureTestingModule({
      imports: [PortalColaboradorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PortalColaboradorComponent);
    component = fixture.componentInstance;
    component.portal = mockPortal;
    component.diasDelMes = mockDias;
    component.mesesDisponibles = [{ valor: 11, nombre: 'Noviembre' }];
    component.mesSeleccionado = 11;
    component.anioSeleccionado = 2026;
    component.catalogoTurnosMap = {
      M8: {
        codigo: 'M8',
        nombre: 'Mañana 8h',
        horaInicio: '07:00',
        horaFin: '15:00',
        horario: '07:00 - 15:00',
        horasOrdinarias: 8,
        horasDiurnas: 8,
        horasNocturnas: 0,
        minutosAlmuerzo: 0,
        bgHex: '#fef3c7',
        textHex: '#92400e',
        borderHex: '#fcd34d',
        esAusencia: false,
        esNocturnoPesado: false,
        descuentaBancoHoras: false,
        visibleEnPaleta: true,
      },
    };
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('rafa_portal_vista_modo');
  });

  it('renderiza el selector segmentado de vista con opciones Agenda y Mes', () => {
    const el: HTMLElement = fixture.nativeElement;
    const switcher = el.querySelector('.portal-view-switcher');
    expect(switcher).not.toBeNull();

    const buttons = el.querySelectorAll('.btn-view-tab');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('Agenda');
    expect(buttons[1].textContent).toContain('Mes');
  });

  it('permite alternar entre modo AGENDA y modo MES y persiste la preferencia', () => {
    component.cambiarModoVista('AGENDA');
    fixture.detectChanges();
    expect(component.modoVistaPortal()).toBe('AGENDA');
    expect(localStorage.getItem('rafa_portal_vista_modo')).toBe('AGENDA');

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.agenda-calendar-list')).not.toBeNull();
    expect(el.querySelector('.weekly-calendar-grid')).toBeNull();

    component.cambiarModoVista('MES');
    fixture.detectChanges();
    expect(component.modoVistaPortal()).toBe('MES');
    expect(localStorage.getItem('rafa_portal_vista_modo')).toBe('MES');

    expect(el.querySelector('.agenda-calendar-list')).toBeNull();
    expect(el.querySelector('.weekly-calendar-grid')).not.toBeNull();
    expect(el.querySelector('.dia-seleccionado-ficha')).not.toBeNull();
  });

  it('en modo AGENDA renderiza tarjetas diarias completas con turnos y descansos', () => {
    component.cambiarModoVista('AGENDA');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const cards = el.querySelectorAll('.agenda-day-card');
    expect(cards.length).toBe(2);

    // Día 1: M8
    const card1 = cards[0];
    expect(card1.querySelector('.agenda-day-number')?.textContent?.trim()).toBe('1');
    expect(card1.querySelector('.agenda-shift-badge')?.textContent).toContain('M8');
    expect(card1.querySelector('.agenda-shift-hours')?.textContent).toContain('07:00 - 15:00');

    // Día 2: L (Libre)
    const card2 = cards[1];
    expect(card2.querySelector('.agenda-day-number')?.textContent?.trim()).toBe('2');
    expect(card2.querySelector('.agenda-free-badge')?.textContent).toContain('Descanso');
  });

  it('emite seleccionarDiaEnPortal al pulsar el botón Permutar en una tarjeta de agenda', () => {
    component.cambiarModoVista('AGENDA');
    fixture.detectChanges();

    const emitSpy = spyOn(component.seleccionarDiaEnPortal, 'emit');
    const el: HTMLElement = fixture.nativeElement;
    const btnPermuta = el.querySelector('.btn-permuta-trigger') as HTMLButtonElement;
    expect(btnPermuta).not.toBeNull();

    btnPermuta.click();
    expect(emitSpy).toHaveBeenCalledWith(1);
  });

  it('en modo MES la ficha inteligente refleja la información del día seleccionado', () => {
    component.cambiarModoVista('MES');
    component.diaPermutaSeleccionado = 1;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const ficha = el.querySelector('.dia-seleccionado-ficha');
    expect(ficha).not.toBeNull();
    expect(ficha?.textContent).toContain('Día 1');
    expect(ficha?.textContent).toContain('M8 · Mañana 8h');
    expect(ficha?.textContent).toContain('07:00 - 15:00');
  });

  it('renderiza la cinta compacta de resumen móvil (portal-mobile-strip) con servicio, horas y banco', () => {
    const el: HTMLElement = fixture.nativeElement;
    const strip = el.querySelector('.portal-mobile-strip');
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain('Urgencias Adultos');
    expect(strip?.textContent).toContain('8h / 168h');
    expect(strip?.textContent).toContain('+4h');
  });

  it('en modo AGENDA invoca desplazarAlDiaActualEnAgenda para llevar al usuario al día actual', (done) => {
    const scrollSpy = spyOn(component, 'desplazarAlDiaActualEnAgenda').and.callThrough();
    component.cambiarModoVista('AGENDA');
    fixture.detectChanges();

    expect(scrollSpy).toHaveBeenCalled();
    setTimeout(() => {
      done();
    }, 150);
  });

  it('controla la habilitación de tiempo adicional: permite días cumplidos (M8 y DISP) y bloquea fechas futuras o periodo cerrado', () => {
    component.portal = {
      ...mockPortal,
      celdas: {
        1: { codigo: 'M8', esRotacion: false, fijada: false },
        2: { codigo: 'DISP', esRotacion: false, fijada: false },
        3: { codigo: 'VAC', esRotacion: false, fijada: false },
      },
    };
    component.estadoCuadrante = 'PUBLICADO';

    const ctrlM8Pasado = component.evaluarControlTiempoAdicional({
      dia: 1,
      fechaIso: '2026-11-01',
      letraDia: 'D',
      esDomingo: true,
      esSabado: false,
      esHoy: false,
    });
    expect(ctrlM8Pasado.habilitado).toBeTrue();
    expect(ctrlM8Pasado.tipo).toBe('HORA_EXTRA_PROLONGACION');
    expect(ctrlM8Pasado.etiquetaCorto).toBe('⏰ +Extra');

    const ctrlDispPasado = component.evaluarControlTiempoAdicional({
      dia: 2,
      fechaIso: '2026-11-02',
      letraDia: 'L',
      esDomingo: false,
      esSabado: false,
      esHoy: false,
    });
    expect(ctrlDispPasado.habilitado).toBeTrue();
    expect(ctrlDispPasado.tipo).toBe('DISPONIBILIDAD_LLAMADO');
    expect(ctrlDispPasado.etiquetaCorto).toBe('🚨 +Llamado');

    const ctrlVac = component.evaluarControlTiempoAdicional({
      dia: 3,
      fechaIso: '2026-11-03',
      letraDia: 'M',
      esDomingo: false,
      esSabado: false,
      esHoy: false,
    });
    expect(ctrlVac.habilitado).toBeFalse();

    const ctrlFuturo = component.evaluarControlTiempoAdicional({
      dia: 1,
      fechaIso: '2099-12-31',
      letraDia: 'J',
      esDomingo: false,
      esSabado: false,
      esHoy: false,
    });
    expect(ctrlFuturo.habilitado).toBeFalse();

    component.estadoCuadrante = 'CERRADO_NOMINA';
    const ctrlCerrado = component.evaluarControlTiempoAdicional({
      dia: 1,
      fechaIso: '2026-11-01',
      letraDia: 'D',
      esDomingo: true,
      esSabado: false,
      esHoy: false,
    });
    expect(ctrlCerrado.habilitado).toBeFalse();
  });

  it('abre el modal de tiempo adicional, calcula las horas y emite enviarSolicitudTiempoAdicional', () => {
    const emitSpy = spyOn(component.enviarSolicitudTiempoAdicional, 'emit');
    const fakeEvent = new MouseEvent('click');
    component.abrirModalTiempoAdicional(fakeEvent, 1);

    expect(component.modalTiempoAdicionalAbierto()).toBeTrue();
    expect(component.diaExtraModal()).toBe(1);
    expect(component.horaInicioExtra()).toBe('15:00');
    expect(component.horaFinExtra()).toBe('17:00');
    expect(component.horasCalculadasModal).toBe(2);

    component.motivoCategoriaExtra.set('CODIGO_AZUL_REANIMACION');
    component.motivoDetalleExtra.set('Reanimación cardiopulmonar prolongada en sala de trauma');
    component.soporteClinicoExtra.set('HC #90123');
    component.confirmarEnvioTiempoAdicional();

    expect(emitSpy).toHaveBeenCalledWith({
      dia: 1,
      turnoBase: 'M8',
      tipo: 'HORA_EXTRA_PROLONGACION',
      horaInicio: '15:00',
      horaFin: '17:00',
      motivoCategoria: 'CODIGO_AZUL_REANIMACION',
      motivoDetalle: 'Reanimación cardiopulmonar prolongada en sala de trauma',
      soporteClinico: 'HC #90123',
    });
    expect(component.modalTiempoAdicionalAbierto()).toBeFalse();
  });

  it('aplica Modelo B (Meta Mensual) en calcularMetricasMesColaborador: nivela déficit primero y liquida el excedente como Hora Extra', () => {
    // 1. Caso Déficit: solo 1 turno M8 (8h) + 3.5h llamado nocturno DISP = 11.5h (< meta mensual 168h)
    const celdasDeficit = {
      1: { codigo: 'M8' as const },
      2: {
        codigo: 'DISP' as const,
        horasAdicionalesAprobadas: 3.5,
        tramosAdicionales: [
          {
            id: 'tr-1',
            tipo: 'DISPONIBILIDAD_LLAMADO',
            horaInicio: '02:00',
            horaFin: '05:30',
            horasAprobadas: 3.5,
            hod: 0,
            hon: 3.5,
            hdfd: 0,
            hdfn: 0,
            motivoCategoria: 'CIRUGIA_URGENCIA',
            motivoDetalle: 'Cesárea urgente',
          },
        ],
      },
    };
    const metDeficit = calcularMetricasMesColaborador(
      mockEmpleado,
      celdasDeficit,
      mockDias,
      component.catalogoTurnosMap,
      {},
      2026,
      11
    );
    expect(metDeficit.horasTrabajadas).toBe(11.5);
    expect(metDeficit.horasAdicionalesAprobadas).toBe(3.5);
    // Como 11.5h <= meta (168h), las 3.5h nivelan jornada ordinaria nocturna (hon = 3.5) y 0h extras
    expect(metDeficit.hon).toBe(3.5);
    expect(metDeficit.horasExtrasTotales).toBe(0);
    expect(metDeficit.hen).toBe(0);
  });
});
