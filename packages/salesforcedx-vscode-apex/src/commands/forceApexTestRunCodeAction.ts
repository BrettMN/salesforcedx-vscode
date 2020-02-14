/*
 * Copyright (c) 2017, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {
  CliCommandExecutor,
  Command,
  SfdxCommandBuilder,
  TestRunner
} from '@salesforce/salesforcedx-utils-vscode/out/src/cli';
import { ContinueResponse } from '@salesforce/salesforcedx-utils-vscode/out/src/types';
import * as vscode from 'vscode';
import { nls } from '../messages';
import { forceApexTestRunCacheService, isEmpty } from '../testRunCache';
import { forceApexTailStop } from './forceApexTail';

const sfdxCoreExports = vscode.extensions.getExtension(
  'salesforce.salesforcedx-vscode-core'
)!.exports;
const {
  channelService,
  EmptyParametersGatherer,
  notificationService,
  ProgressNotification,
  SfdxCommandlet,
  sfdxCoreSettings,
  SfdxWorkspaceChecker,
  taskViewService
} = sfdxCoreExports;
const SfdxCommandletExecutor = sfdxCoreExports.SfdxCommandletExecutor;

// build force:apex:test:run w/ given test class or test method
export class ForceApexTestRunCodeActionExecutor extends SfdxCommandletExecutor<{}> {
  protected test: string;
  protected shouldGetCodeCoverage: boolean = false;
  protected builder: SfdxCommandBuilder = new SfdxCommandBuilder();
  private outputToJson: string;

  public constructor(
    test: string,
    shouldGetCodeCoverage: boolean,
    outputToJson: string
  ) {
    super();
    this.test = test || '';
    this.shouldGetCodeCoverage = shouldGetCodeCoverage;
    this.outputToJson = outputToJson;
  }

  public build(data: {}): Command {
    this.builder = this.builder
      .withDescription(
        nls.localize('force_apex_test_run_codeAction_description_text')
      )
      .withArg('force:apex:test:run')
      .withFlag('--tests', this.test)
      .withFlag('--resultformat', 'human')
      .withFlag('--outputdir', this.outputToJson)
      .withFlag('--loglevel', 'error')
      .withLogName('force_apex_test_run_code_action');

    if (this.shouldGetCodeCoverage) {
      this.builder = this.builder.withArg('--codecoverage');
    }

    return this.builder.build();
  }

  public async execute(response: ContinueResponse<string>): Promise<void> {
    const startTime = process.hrtime();
    const cancellationTokenSource = new vscode.CancellationTokenSource();
    const cancellationToken = cancellationTokenSource.token;

    const execution = new CliCommandExecutor(this.build(response.data), {
      cwd: vscode.workspace.workspaceFolders![0].uri.fsPath,
      env: { SFDX_JSON_TO_STDOUT: 'true' }
    }).execute(cancellationToken);

    // channelService.streamCommandStartStop(execution);
    channelService.streamCommandStart(
      execution.command.toString(),
      execution.command.toCommand()
    );
    channelService.showChannelOutput();

    let stdOut = '';
    execution.stdoutSubject.subscribe(realData => {
      stdOut += realData.toString();
    });

    execution.processExitSubject.subscribe(async exitCode => {
      this.logMetric(execution.command.logName, startTime);
      // this is how we chain commands
      // vscode.commands.executeCommand('sfdx.force.apex.log.get');
      await forceApexTailStop();
      channelService.streamCommandExitStop(
        exitCode,
        execution.command.toCommand()
      );
    });

    notificationService.reportCommandExecutionStatus(
      execution,
      cancellationToken
    );
    ProgressNotification.show(execution, cancellationTokenSource);
    taskViewService.addCommandExecution(execution, cancellationTokenSource);
  }
}

async function forceApexTestRunCodeAction(test: string) {
  const getCodeCoverage = sfdxCoreSettings.getRetrieveTestCodeCoverage();
  const outputToJson = getTempFolder();
  const commandlet = new SfdxCommandlet(
    new SfdxWorkspaceChecker(),
    new EmptyParametersGatherer(),
    new ForceApexTestRunCodeActionExecutor(test, getCodeCoverage, outputToJson)
  );
  await commandlet.run();
}

function getTempFolder(): string {
  if (vscode.workspace && vscode.workspace.workspaceFolders) {
    const apexDir = new TestRunner().getTempFolder(
      vscode.workspace.workspaceFolders[0].uri.fsPath,
      'apex'
    );
    return apexDir;
  } else {
    throw new Error(nls.localize('cannot_determine_workspace'));
  }
}

//   T E S T   C L A S S

// redirects to run-all-tests cmd
export async function forceApexTestClassRunCodeActionDelegate(
  testClass: string
) {
  vscode.commands.executeCommand('sfdx.force.apex.test.class.run', testClass);
}

// evaluate test class param: if not provided, apply cached value
// exported for testability
export async function resolveTestClassParam(
  testClass: string
): Promise<string> {
  if (isEmpty(testClass)) {
    // value not provided for re-run invocations
    // apply cached value, if available
    if (forceApexTestRunCacheService.hasCachedClassTestParam()) {
      testClass = forceApexTestRunCacheService.getLastClassTestParam();
    }
  } else {
    await forceApexTestRunCacheService.setCachedClassTestParam(testClass);
  }
  return testClass;
}

// invokes apex test run on all tests in a class
export async function forceApexTestClassRunCodeAction(testClass: string) {
  testClass = await resolveTestClassParam(testClass);
  if (isEmpty(testClass)) {
    // test param not provided: show error and terminate
    notificationService.showErrorMessage(
      nls.localize('force_apex_test_run_codeAction_no_class_test_param_text')
    );
    return;
  }

  await forceApexTestRunCodeAction(testClass);
}

//   T E S T   M E T H O D

// redirects to run-test-method cmd
export async function forceApexTestMethodRunCodeActionDelegate(
  testMethod: string
) {
  vscode.commands.executeCommand('sfdx.force.apex.test.method.run', testMethod);
}

// evaluate test method param: if not provided, apply cached value
// exported for testability
export async function resolveTestMethodParam(
  testMethod: string
): Promise<string> {
  if (isEmpty(testMethod)) {
    // value not provided for re-run invocations
    // apply cached value, if available
    if (forceApexTestRunCacheService.hasCachedMethodTestParam()) {
      testMethod = forceApexTestRunCacheService.getLastMethodTestParam();
    }
  } else {
    await forceApexTestRunCacheService.setCachedMethodTestParam(testMethod);
  }

  return testMethod;
}

// invokes apex test run on a test method
export async function forceApexTestMethodRunCodeAction(testMethod: string) {
  testMethod = await resolveTestMethodParam(testMethod);
  if (isEmpty(testMethod)) {
    // test param not provided: show error and terminate
    notificationService.showErrorMessage(
      nls.localize('force_apex_test_run_codeAction_no_method_test_param_text')
    );
    return;
  }

  await forceApexTestRunCodeAction(testMethod);
}
