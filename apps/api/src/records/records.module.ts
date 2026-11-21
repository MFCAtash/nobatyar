import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";

@Module({ imports: [StorageModule], controllers: [RecordsController], providers: [RecordsService], exports: [RecordsService] })
export class RecordsModule {}
