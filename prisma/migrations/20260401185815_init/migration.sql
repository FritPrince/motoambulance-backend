-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PATIENT', 'RESPONDER', 'DISPATCHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('PENDING', 'ASSIGNED', 'ENROUTE', 'ONSITE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('PENDING', 'CRITICAL', 'URGENT', 'STABLE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PATIENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "emergencyType" TEXT NOT NULL,
    "triageLevel" "TriageLevel" NOT NULL DEFAULT 'PENDING',
    "status" "AlertStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
