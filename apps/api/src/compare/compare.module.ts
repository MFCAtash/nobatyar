import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CompareController } from "./compare.controller";

@Module({ imports: [PrismaModule], controllers: [CompareController] })
export class CompareModule {}
