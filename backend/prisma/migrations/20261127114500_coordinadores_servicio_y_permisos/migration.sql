-- AlterTable: Agregar coordinadoresIds a servicios para gobierno multi-servicio de Coordinadores (TurnosCuadranteEditar)
ALTER TABLE "servicios" ADD COLUMN IF NOT EXISTS "coordinadoresIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
