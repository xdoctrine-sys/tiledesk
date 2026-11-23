import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MonitorV2Component } from './monitor-v2.component';

/** Lazy module of /project/:projectid/monitor-v2 (see app.routing.ts). Loaded only when the page is opened. */
@NgModule({
  imports: [CommonModule, RouterModule.forChild([{ path: '', component: MonitorV2Component }]), MonitorV2Component],
})
export class MonitorV2Module {}
