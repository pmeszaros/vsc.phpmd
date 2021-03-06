/**
 * VS Code extension for php, using phpmd.
 *
 *
 * Licensed under The MIT License
 * For full copyright and license information, please see the LICENSE.txt
 * Redistributions of files must retain the above copyright notice.
 *
 * @copyright     Yang Lin <linyang95#aol.com>
 * @link          http://github.com/ly95/vsc.phpmd
 * @license       http://www.opensource.org/licenses/mit-license.php MIT License
 */
import * as vscode from 'vscode';
import * as cp from 'child_process';

enum RunMode {
	onSave,
	onType
};

enum ReportFormat {
	xml,
	text,
	html
};

enum Ruleset {
	cleancode,
	codesize,
	controversial,
	design,
	naming,
	unusedcode
};

let Rulesets: string = "cleancode,codesize,controversial,design,naming,unusedcode";

/**
 * PHPMD
 */
class PHPMD {
	listener: vscode.Disposable;
	runMode: RunMode;
	rulesets: Array<string>;
	executable: string;
	delayerHandler: number;
	reportFormat = 'text';
	matchExpression = /([a-zA-Z_\/\.]+):(\d+)	(.*)/;
	diagnosticCollection: vscode.DiagnosticCollection;
	enabled: boolean;
	tmpStr = "";

	constructor() {
		this.init();
	}

	dispose() {
		this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
	}

	init() {
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection("phpmd");

		let section = vscode.workspace.getConfiguration("phpmd");
		this.enabled = section.get('enabled', true);

		// Not support now.
		// this.runMode = section.get("validate.run_mode", RunMode.onSave);
		this.runMode = RunMode.onSave;
		this.executable = section.get("validate.executablePath", null);

		let rulesets = section.get("validate.rulesets", Rulesets);
		if (!rulesets) {
			rulesets = Rulesets;
		}
		this.rulesets = new Array;
		let tmp = rulesets.split(",");
		for (let i = 0; i < tmp.length; i++) {
			let element = tmp[i].trim();
			if (rulesets.indexOf(element) !== -1) {
				this.rulesets.push(element);
			}
		}
	}

	activate(context: vscode.ExtensionContext) {
		if (!this.enabled) {
			return;
		}
		if (this.listener) {
			this.listener.dispose();
		}
		if (this.runMode === RunMode.onType) {
			this.listener = vscode.workspace.onDidChangeTextDocument((e) => {
				// Todo
				// this.doValidate(e.document);
			});
		} else {
			this.listener = vscode.workspace.onDidSaveTextDocument((e) => {
				this.doValidate(e);
			});
		}

		vscode.workspace.onDidCloseTextDocument((e) => {
			this.diagnosticCollection.delete(e.uri);
		});
		
		context.subscriptions.push(this);
	}

	doValidate(document: vscode.TextDocument) {
		if (document.languageId !== 'php') {
			// vscode.window.showInformationMessage("Only php files can be validate by phpmd.");
			return;
		}

		if (this.delayerHandler) {
			clearTimeout(this.delayerHandler);
		}

		this.delayerHandler = setTimeout((document: vscode.TextDocument) => {
			let executablePath = this.executable || "phpmd";
			let args = [];

			args.push(document.fileName);
			args.push(this.reportFormat);
			args.push(this.rulesets.join(","));

			let diagnostics = new Array;

			let exec = cp.spawn(executablePath, args);

			exec.stdout.on('data', (data: Buffer) => {
				let result = data.toString();
				// console.log('stdout: ' + result);
				this.tmpStr += result;
				do {
					let lines = this.tmpStr.split("\n");
					let line = lines.shift();
					if (lines.length) {
						this.tmpStr = lines.join("\n");
					} else {
						this.tmpStr = "";
						break;
					}
					if (!line.length) {
						continue;
					}
					let diagnostic = this.parser(line);
					if (diagnostic === null) {
						break;
					}
					diagnostics.push(diagnostic);
				} while (true);
			});
			// exec.stderr.on('data', (data: Buffer) => {
			// 	console.log('stderr: ' + data);
			// });
			exec.on('close', (code: number) => {
				// PHPMD's command line tool currently defines three different exit codes.
				// 0, This exit code indicates that everything worked as expected. This means there was no error/exception and PHPMD hasn't detected any rule violation in the code under test.
				// 1, This exit code indicates that an error/exception occured which has interrupted PHPMD during execution.
				// 2, This exit code means that PHPMD has processed the code under test without the occurence of an error/exception, but it has detected rule violations in the analyzed source code.
				// console.log('close: ' + code);
				if (code > 0) {
					// console.log("diagnostics.length " + diagnostics.length);
					this.diagnosticCollection.set(document.uri, diagnostics);
				} else {
					this.diagnosticCollection.delete(document.uri);
				}
			});
		}, 1000, document);
	}

	parser(line: string) {
		let matches = line.match(this.matchExpression);
		if (matches) {
			let message = "PHPMD: " + matches[3];
			let line_no = parseInt(matches[2]) - 1;
			let diagnostic = new vscode.Diagnostic(new vscode.Range(line_no, 0, line_no, Number.MAX_VALUE), message);
			return diagnostic;
		}
		return null;
	}
}

export function activate(context: vscode.ExtensionContext) {
	let phpmd = new PHPMD();
	phpmd.activate(context);
}