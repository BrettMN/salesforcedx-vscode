/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { Config, Org } from '@salesforce/core';
import { getRootWorkspacePath } from '@salesforce/salesforcedx-utils-vscode';
import { LibraryCommandletExecutor } from '@salesforce/salesforcedx-utils-vscode/out/src';
import { Row, Table } from '@salesforce/salesforcedx-utils-vscode/out/src/output';
import { ContinueResponse } from '@salesforce/salesforcedx-utils-vscode/src/types';
import { channelService, OUTPUT_CHANNEL } from '../channels';
import {
  CONFIG_SET_EXECUTOR,
  CONFIG_SET_NAME,
  DEFAULT_USERNAME_KEY,
  TABLE_NAME_COL,
  TABLE_SUCCESS_COL,
  TABLE_VAL_COL
} from '../constants';
import { nls } from '../messages';
import {
  EmptyParametersGatherer,
  SfdxCommandlet,
  SfdxWorkspaceChecker
} from './util';

export class ForceConfigSetExecutor extends LibraryCommandletExecutor<{}> {
  private usernameOrAlias: string;
  protected showChannelOutput = false;
  private outputTableRow: Row = {};

  constructor(
    usernameOrAlias: string
  ) {
    super(nls.localize(CONFIG_SET_EXECUTOR), CONFIG_SET_EXECUTOR, OUTPUT_CHANNEL);
    this.usernameOrAlias = `${usernameOrAlias}`.split(',')[0];
  }

  public async run(response: ContinueResponse<string>): Promise<boolean> {
    let result: boolean;
    let message: string | undefined;

    // In order to correctly setup Config, the process directory needs to be set to the current workspace directory
    const path = getRootWorkspacePath(); // Get current workspace path
    process.chdir(path); // Set process directory

    const config = await Config.create(Config.getDefaultOptions());

    try {
      // should only set if username is valid or an empty string (unset)
      if (this.usernameOrAlias) { // check if username is an empty string
        await Org.create({ aliasOrUsername: this.usernameOrAlias }); // check username is valid
      }

      result = true;
      config.set(DEFAULT_USERNAME_KEY, this.usernameOrAlias);
      await config.write();
    } catch (error) {
      error instanceof Error
        ? message = error.message
        : message = String(error);
      result = false;
    }
    this.outputTableRow = { name: DEFAULT_USERNAME_KEY, val: this.usernameOrAlias, success: String(result) };
    const outputTable = this.formatOutput(this.outputTableRow);
    channelService.appendLine(outputTable);
    if (message) {
      channelService.appendLine(`Error: ${message}`);
      channelService.showChannelOutput();
    }
    return result;
  }

  private formatOutput(input: Row): string {
    const title = nls.localize(CONFIG_SET_NAME);
    const table = new Table();
    const outputTable = table.createTable(
      [input],
      [
        { key: 'name', label: nls.localize(TABLE_NAME_COL) },
        { key: 'val', label: nls.localize(TABLE_VAL_COL) },
        { key: 'success', label: nls.localize(TABLE_SUCCESS_COL) }
      ],
      title
    );
    return outputTable;
  }
}

const workspaceChecker = new SfdxWorkspaceChecker();
const parameterGatherer = new EmptyParametersGatherer();

export async function forceConfigSet(usernameOrAlias: string) {
  const commandlet = new SfdxCommandlet(
    workspaceChecker,
    parameterGatherer,
    new ForceConfigSetExecutor(usernameOrAlias)
  );
  await commandlet.run();
}
