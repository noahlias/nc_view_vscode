const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

let outputChannel;

function getExtensionSettings() {
  const config = vscode.workspace.getConfiguration("ncViewer");
  return config;
}

function activate(context) {
  outputChannel = vscode.window.createOutputChannel("NC Viewer Debug");
  outputChannel.appendLine("[NC Viewer] Extension activated");
  outputChannel.show(true);
  // show settings for debugging
  outputChannel.appendLine(
    `[NC Viewer] Current Settings: ${JSON.stringify(getExtensionSettings())}`,
  );

  let disposable = vscode.commands.registerCommand("ncViewer.open", (uri) => {
    try {
      if (!uri) {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          uri = activeEditor.document.uri;
        } else {
          vscode.window.showErrorMessage("NC Viewer: No active file found");
          return;
        }
      }

      const panel = vscode.window.createWebviewPanel(
        "ncViewer",
        `NC Viewer - ${path.basename(uri.fsPath)}`,
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, "media")),
          ],
        },
      );

      panel.webview.html = getWebviewContent(
        panel.webview,
        context.extensionPath,
      );

      vscode.workspace.openTextDocument(uri).then((doc) => {
        const fileContent = doc.getText();
        panel.webview.postMessage({
          type: "loadGCode",
          ncText: fileContent,
          settings: getExtensionSettings(),
        });

        let targetEditor = null;

        function findTargetEditor() {
          return vscode.window.visibleTextEditors.find(
            (editor) => editor.document.uri.toString() === uri.toString(),
          );
        }

        const onDidChangeCursorPosition =
          vscode.window.onDidChangeTextEditorSelection((e) => {
            if (e.textEditor.document.uri.toString() === uri.toString()) {
              const lineNumber = e.selections[0].active.line;

              panel.webview.postMessage({
                type: "cursorPositionChanged",
                lineNumber: lineNumber,
              });
            }
          });

        const onDidChangeTextDocument =
          vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === uri.toString()) {
              const updatedContent = e.document.getText();
              panel.webview.postMessage({
                type: "contentChanged",
                ncText: updatedContent,
                settings: getExtensionSettings(),
              });
            }
          });

        panel.onDidDispose(() => {
          onDidChangeCursorPosition.dispose();
          onDidChangeTextDocument.dispose();
        });
      });

      panel.webview.onDidReceiveMessage((message) => {
        if (message.type === "highlightLine") {
          const targetEditor = vscode.window.visibleTextEditors.find(
            (editor) => editor.document.uri.toString() === uri.toString(),
          );

          if (targetEditor) {
            const line = message.lineNumber;
            const range = new vscode.Range(line, 0, line, 0);
            targetEditor.selection = new vscode.Selection(
              range.start,
              range.end,
            );
            targetEditor.revealRange(
              range,
              vscode.TextEditorRevealType.InCenter,
            );

            vscode.window.showTextDocument(targetEditor.document, {
              viewColumn: targetEditor.viewColumn,
              preserveFocus: false,
            });
          } else {
            outputChannel.appendLine(
              `[NC Viewer] Target editor not found for URI: ${uri.toString()}`,
            );

            vscode.workspace.openTextDocument(uri).then((doc) => {
              vscode.window
                .showTextDocument(doc, {
                  viewColumn: vscode.ViewColumn.One,
                  preserveFocus: false,
                })
                .then((editor) => {
                  const line = message.lineNumber;
                  const range = new vscode.Range(line, 0, line, 0);
                  editor.selection = new vscode.Selection(
                    range.start,
                    range.end,
                  );
                  editor.revealRange(
                    range,
                    vscode.TextEditorRevealType.InCenter,
                  );
                });
            });
          }
        }
      });
    } catch (error) {
      outputChannel.appendLine(`[NC Viewer] ERROR: ${error.message}`);
      vscode.window.showErrorMessage(`NC Viewer: ${error.message}`);
    }
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(webview, extensionPath) {
  try {
    outputChannel.appendLine(`[NC Viewer] getWebviewContent called`);
    outputChannel.appendLine(`[NC Viewer] Extension path: ${extensionPath}`);

    const mediaPath = path.join(extensionPath, "media");
    const indexHtmlPath = path.join(mediaPath, "index.html");

    outputChannel.appendLine(`[NC Viewer] Media path: ${mediaPath}`);
    outputChannel.appendLine(`[NC Viewer] HTML path: ${indexHtmlPath}`);

    const filesToCheck = [
      { path: indexHtmlPath, name: "index.html" },
      {
        path: path.join(mediaPath, "g_code_parser.js"),
        name: "g_code_parser.js",
      },
      {
        path: path.join(mediaPath, "libs", "three.module.js"),
        name: "three.module.js",
      },
      {
        path: path.join(
          mediaPath,
          "libs",
          "addons",
          "controls",
          "OrbitControls.js",
        ),
        name: "OrbitControls.js",
      },
    ];

    filesToCheck.forEach((file) => {
      if (fs.existsSync(file.path)) {
        outputChannel.appendLine(`[NC Viewer] ✓ Found: ${file.name}`);
      } else {
        outputChannel.appendLine(
          `[NC Viewer] ✗ Missing: ${file.name} at ${file.path}`,
        );
      }
    });

    if (!fs.existsSync(indexHtmlPath)) {
      throw new Error(`HTML file not found: ${indexHtmlPath}`);
    }

    let html = fs.readFileSync(indexHtmlPath, "utf8");
    outputChannel.appendLine(
      `[NC Viewer] HTML file read, length: ${html.length} characters`,
    );

    const mediaUri = webview.asWebviewUri(vscode.Uri.file(mediaPath));
    outputChannel.appendLine(`[NC Viewer] Media URI: ${mediaUri.toString()}`);

    const originalHtmlLength = html.length;
    html = html.replace(
      /src="\.\/g_code_parser\.js"/g,
      `src="${mediaUri}/g_code_parser.js"`,
    );
    html = html.replace(/\.\/libs\//g, `${mediaUri}/libs/`);

    outputChannel.appendLine(`[NC Viewer] Path replacement completed`);
    outputChannel.appendLine(
      `[NC Viewer] HTML length after replacement: ${html.length}`,
    );

    if (html.length === originalHtmlLength) {
      outputChannel.appendLine(
        `[NC Viewer] WARNING: No path replacements made - check HTML patterns`,
      );
    }

    return html;
  } catch (error) {
    outputChannel.appendLine(
      `[NC Viewer] ERROR in getWebviewContent: ${error.message}`,
    );
    outputChannel.appendLine(`[NC Viewer] Error stack: ${error.stack}`);
    throw error;
  }
}

exports.activate = activate;

function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine("[NC Viewer] Extension deactivated");
    outputChannel.dispose();
  }
}

exports.deactivate = deactivate;
