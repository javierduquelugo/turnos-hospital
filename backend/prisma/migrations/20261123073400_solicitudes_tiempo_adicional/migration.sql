-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TipoTiempoAdicional" AS ENUM ('HORA_EXTRA_PROLONGACION', 'DISPONIBILIDAD_LLAMADO', 'GUARDIA_EXTRAORDINARIA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "EstadoTiempoAdicional" AS ENUM ('PENDIENTE_SUPERVISOR', 'APROBADA', 'RECHAZADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "solicitudes_tiempo_adicional" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "dia" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "turnoBase" TEXT NOT NULL DEFAULT 'L',
    "tipo" "TipoTiempoAdicional" NOT NULL DEFAULT 'HORA_EXTRA_PROLONGACION',
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "horasCalculadas" DOUBLE PRECISION NOT NULL,
    "horasAprobadas" DOUBLE PRECISION,
    "hod" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hdfd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hdfn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motivoCategoria" TEXT NOT NULL,
    "motivoDetalle" TEXT NOT NULL,
    "soporteClinico" TEXT,
    "estado" "EstadoTiempoAdicional" NOT NULL DEFAULT 'PENDIENTE_SUPERVISOR',
    "supervisorId" TEXT,
    "supervisorNombre" TEXT,
    "observacionSupervisor" TEXT,
    "motivoRechazo" TEXT,
    "fechaRespuesta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_tiempo_adicional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "solicitudes_tiempo_adicional_empleadoId_fecha_idx" ON "solicitudes_tiempo_adicional"("empleadoId", "fecha");
CREATE INDEX IF NOT EXISTS "solicitudes_tiempo_adicional_empleadoId_anio_mes_estado_idx" ON "solicitudes_tiempo_adicional"("empleadoId", "anio", "mes", "estado");
CREATE INDEX IF NOT EXISTS "solicitudes_tiempo_adicional_servicioId_estado_idx" ON "solicitudes_tiempo_adicional"("servicioId", "estado");
CREATE INDEX IF NOT EXISTS "solicitudes_tiempo_adicional_anio_mes_idx" ON "solicitudes_tiempo_adicional"("anio", "mes");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "solicitudes_tiempo_adicional" ADD CONSTRAINT "solicitudes_tiempo_adicional_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "solicitudes_tiempo_adicional" ADD CONSTRAINT "solicitudes_tiempo_adicional_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ensure DISP turno is visible in palette
UPDATE "tipos_turno" SET "visibleEnPaleta" = true WHERE "codigo" = 'DISP';
