/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { getRootWorkspacePath } from '@salesforce/salesforcedx-utils-vscode';
import { FileInfo } from '@salesforce/salesforcedx-utils-vscode/src/services/types/FileInfo';
import {
  DeployResult,
  FileProperties
} from '@salesforce/source-deploy-retrieve';
import { ExtensionContext, Memento } from 'vscode';
import { WorkspaceContext } from '../context';
import { nls } from '../messages';
import { StatusOutputRowType } from '@salesforce/salesforcedx-utils-vscode/src/services/sourceTrackingService';

interface ConflictFileProperties {
  lastModifiedDate: string;
}

export class PersistentStorageService {
  private storage: Memento;
  private static instance?: PersistentStorageService;

  private constructor(extensionContext: ExtensionContext) {
    this.storage = extensionContext.globalState;
  }

  public static initialize(extensionContext: ExtensionContext) {
    PersistentStorageService.instance = new PersistentStorageService(
      extensionContext
    );
  }

  public static getInstance(): PersistentStorageService {
    if (!PersistentStorageService.instance) {
      const errorMsg = nls.localize('conflict_detect_initialization_error');
      throw new Error(errorMsg);
    }
    return PersistentStorageService.instance;
  }

  public static updateCacheAfterPushPull(changedFiles: any): void {
    const instance = PersistentStorageService.getInstance();

    const changedFilesWithMetaFiles = instance.bolsterChangedFiles(
      changedFiles
    );

    // Pass the array to PersistentStorageService for updating of timestamps,
    // so that conflict detection will behave as expected
    instance.setPropertiesForFilesPushPull(changedFilesWithMetaFiles);
  }

  private bolsterChangedFiles(changedFiles: FileInfo[]): FileInfo[] {
    // build a new array that adds '*-meta.xml' files for each .cls or .cmp file
    const bolsteredChangedFiles = [];
    for (const file of changedFiles) {
      if (file.filePath) {
        bolsteredChangedFiles.push(file);
        const filePath = file.filePath;
        const filePathLength = filePath.length;
        const fileExtension = filePath.substring(filePathLength - 4);
        if (fileExtension === '.cls' || fileExtension === '.cmp') {
          bolsteredChangedFiles.push({
            type: file.type,
            fullName: file.fullName + '-meta.xml'
          });
        }
      }
    }
    return bolsteredChangedFiles;
  }

  public getPropertiesForFile(key: string): ConflictFileProperties | undefined {
    return this.storage.get<ConflictFileProperties>(key);
  }

  public setPropertiesForFile(
    key: string,
    conflictFileProperties: ConflictFileProperties | undefined
  ) {
    this.storage.update(key, conflictFileProperties);
  }

  public setPropertiesForFilesRetrieve(
    fileProperties: FileProperties | FileProperties[]
  ) {
    const fileArray = Array.isArray(fileProperties)
      ? fileProperties
      : [fileProperties];
    for (const fileProperty of fileArray) {
      this.setPropertiesForFile(
        this.makeKey(fileProperty.type, fileProperty.fullName),
        {
          lastModifiedDate: fileProperty.lastModifiedDate
        }
      );
    }
  }

  public setPropertiesForFilesDeploy(result: DeployResult) {
    const fileResponses = result.getFileResponses();
    for (const file of fileResponses) {
      this.setPropertiesForFile(this.makeKey(file.type, file.fullName), {
        lastModifiedDate: String(result.response.lastModifiedDate)
      });
    }
  }

  public setPropertiesForFilesPushPull(files: any) {
    const afterPushPullTimestamp = new Date().toISOString();
    for (const file of files) {
      this.setPropertiesForFile(this.makeKey(file.type, file.fullName), {
        lastModifiedDate: afterPushPullTimestamp
      });
    }
  }

  public makeKey(type: string, fullName: string): string {
    const orgUserName = WorkspaceContext.getInstance().username;
    const projectPath = getRootWorkspacePath();
    return `${orgUserName}#${projectPath}#${type}#${fullName}`;
  }
}
