import { TitleCasePipe } from '@angular/common';
import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { forkJoin as observableForkJoin, Observable, Subscriber } from 'rxjs';
import { RgwMultisiteService } from '~/app/shared/api/rgw-multisite.service';
import { CriticalConfirmationModalComponent } from '~/app/shared/components/critical-confirmation-modal/critical-confirmation-modal.component';
import { ActionLabelsI18n } from '~/app/shared/constants/app.constants';
import { TableComponent } from '~/app/shared/datatable/table/table.component';
import { CellTemplate } from '~/app/shared/enum/cell-template.enum';
import { Icons } from '~/app/shared/enum/icons.enum';
import { CdTableAction } from '~/app/shared/models/cd-table-action';
import { CdTableColumn } from '~/app/shared/models/cd-table-column';
import { CdTableFetchDataContext } from '~/app/shared/models/cd-table-fetch-data-context';
import { CdTableSelection } from '~/app/shared/models/cd-table-selection';
import { FinishedTask } from '~/app/shared/models/finished-task';
import { Permission } from '~/app/shared/models/permissions';
import { AuthStorageService } from '~/app/shared/services/auth-storage.service';
import { ModalService } from '~/app/shared/services/modal.service';
import { TaskWrapperService } from '~/app/shared/services/task-wrapper.service';
import { URLBuilderService } from '~/app/shared/services/url-builder.service';

const BASE_URL = 'rgw/multisite/sync-policy';

@Component({
  selector: 'cd-rgw-multisite-sync-policy',
  templateUrl: './rgw-multisite-sync-policy.component.html',
  styleUrls: ['./rgw-multisite-sync-policy.component.scss'],
  providers: [{ provide: URLBuilderService, useValue: new URLBuilderService(BASE_URL) }]
})
export class RgwMultisiteSyncPolicyComponent implements OnInit {
  @ViewChild(TableComponent, { static: true })
  table: TableComponent;
  @ViewChild('deleteTpl', { static: true })
  deleteTpl: TemplateRef<any>;

  columns: Array<CdTableColumn> = [];
  syncPolicyData: any = [];
  tableActions: CdTableAction[];
  selection = new CdTableSelection();
  permission: Permission;

  constructor(
    private rgwMultisiteService: RgwMultisiteService,
    private titleCasePipe: TitleCasePipe,
    private actionLabels: ActionLabelsI18n,
    private urlBuilder: URLBuilderService,
    private authStorageService: AuthStorageService,
    private modalService: ModalService,
    private taskWrapper: TaskWrapperService
  ) {}

  ngOnInit(): void {
    this.permission = this.authStorageService.getPermissions().rgw;
    this.columns = [
      {
        prop: 'uniqueId',
        isHidden: true
      },
      {
        name: $localize`Group Name`,
        prop: 'groupName',
        flexGrow: 1
      },
      {
        name: $localize`Status`,
        prop: 'status',
        flexGrow: 1,
        cellTransformation: CellTemplate.tooltip,
        customTemplateConfig: {
          map: {
            Enabled: { class: 'badge-success', tooltip: 'sync is allowed and enabled' },
            Allowed: { class: 'badge-info', tooltip: 'sync is allowed' },
            Forbidden: {
              class: 'badge-warning',
              tooltip:
                'sync (as defined by this group) is not allowed and can override other groups'
            }
          }
        },
        pipe: this.titleCasePipe
      },
      {
        name: $localize`Zonegroup`,
        prop: 'zonegroup',
        flexGrow: 1
      },
      {
        name: $localize`Bucket`,
        prop: 'bucket',
        flexGrow: 1
      }
    ];
    const getSyncGroupName = () => {
      if (this.selection.first() && this.selection.first().groupName) {
        if (this.selection.first().bucket) {
          return `${encodeURIComponent(this.selection.first().groupName)}/${encodeURIComponent(
            this.selection.first().bucket
          )}`;
        }
        return `${encodeURIComponent(this.selection.first().groupName)}`;
      }
      return '';
    };
    const addAction: CdTableAction = {
      permission: 'create',
      icon: Icons.add,
      routerLink: () => this.urlBuilder.getCreate(),
      name: this.actionLabels.CREATE,
      canBePrimary: (selection: CdTableSelection) => !selection.hasSelection
    };
    const editAction: CdTableAction = {
      permission: 'update',
      icon: Icons.edit,
      routerLink: () => this.urlBuilder.getEdit(getSyncGroupName()),
      name: this.actionLabels.EDIT
    };
    const deleteAction: CdTableAction = {
      permission: 'delete',
      icon: Icons.destroy,
      click: () => this.deleteAction(),
      disable: () => !this.selection.hasSelection,
      name: this.actionLabels.DELETE,
      canBePrimary: (selection: CdTableSelection) => selection.hasMultiSelection
    };
    this.tableActions = [addAction, editAction, deleteAction];
  }

  transformSyncPolicyData(allSyncPolicyData: any) {
    if (allSyncPolicyData && allSyncPolicyData.length > 0) {
      allSyncPolicyData.forEach((policy: any) => {
        this.syncPolicyData.push({
          uniqueId: policy['id'] + (policy['bucketName'] ? policy['bucketName'] : ''),
          groupName: policy['id'],
          status: policy['status'],
          bucket: policy['bucketName'],
          zonegroup: ''
        });
      });
      this.syncPolicyData = [...this.syncPolicyData];
    }
  }

  updateSelection(selection: CdTableSelection) {
    this.selection = selection;
  }

  getPolicyList(context: CdTableFetchDataContext) {
    this.rgwMultisiteService.getSyncPolicy('', '', true).subscribe(
      (resp: object[]) => {
        this.syncPolicyData = [];
        this.transformSyncPolicyData(resp);
      },
      () => {
        context.error();
      }
    );
  }

  deleteAction() {
    const groupNames = this.selection.selected.map((policy: any) => policy.groupName);
    this.modalService.show(CriticalConfirmationModalComponent, {
      itemDescription: this.selection.hasSingleSelection
        ? $localize`Policy Group`
        : $localize`Policy Groups`,
      itemNames: groupNames,
      bodyTemplate: this.deleteTpl,
      submitActionObservable: () => {
        return new Observable((observer: Subscriber<any>) => {
          this.taskWrapper
            .wrapTaskAroundCall({
              task: new FinishedTask('rgw/multisite/sync-policy/delete', {
                group_names: groupNames
              }),
              call: observableForkJoin(
                this.selection.selected.map((policy: any) => {
                  return this.rgwMultisiteService.removeSyncPolicyGroup(
                    policy.groupName,
                    policy.bucket
                  );
                })
              )
            })
            .subscribe({
              error: (error: any) => {
                // Forward the error to the observer.
                observer.error(error);
                // Reload the data table content because some deletions might
                // have been executed successfully in the meanwhile.
                this.table.refreshBtn();
              },
              complete: () => {
                // Notify the observer that we are done.
                observer.complete();
                // Reload the data table content.
                this.table.refreshBtn();
              }
            });
        });
      }
    });
  }
}