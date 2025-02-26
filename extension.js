const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
    let panel;

    let disposable = vscode.commands.registerCommand('taskToDo.showTodos', () => {
        if (panel) {
            panel.reveal(vscode.ViewColumn.One);
        } else {
            panel = vscode.window.createWebviewPanel(
                'taskToDoWebview',
                'To-Do List',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            scanWorkspaceForTodos(panel);

            panel.onDidDispose(() => {
                panel = undefined;
            }, null, context.subscriptions);

            vscode.workspace.onDidSaveTextDocument(() => {
                if (panel) scanWorkspaceForTodos(panel);
            });

            panel.webview.onDidReceiveMessage(
                message => {
                    if (message.command === 'navigate') {
                        openFileAtLine(message.fileName, message.line);
                    } else if (message.command === 'remove') {
                        removeTodoFromFile(message.fileName, message.line);
                        if (panel) scanWorkspaceForTodos(panel);
                    }
                },
                undefined,
                context.subscriptions
            );
        }
    });

    context.subscriptions.push(disposable);

    function scanWorkspaceForTodos(panel) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const priorityMap = { HIGH: 1, MEDIUM: 2, LOW: 3 };
        let todos = [];
        const regex = /(\/\/ TODO|\/\* TODO|# TODO|#TODO|\/\/TODO|\/\/ todo|\/\* todo|# todo|#todo|\/\/todo)\s*(?:\[(\d|HIGH|MEDIUM|LOW)\])?\s*(.*)/g;

        function scanFile(filePath) {
            if (!fs.existsSync(filePath)) return;
            const text = fs.readFileSync(filePath, 'utf8');
            const lines = text.split('\n');

            lines.forEach((line, index) => {
                let match;
                while ((match = regex.exec(line)) !== null) {
                    let priorityText = match[2];
                    let priority = "MEDIUM";
                    if (priorityText === "1" || (priorityText && priorityText.toUpperCase() === "HIGH")) {
                        priority = "HIGH";
                    } else if (priorityText === "2" || (priorityText && priorityText.toUpperCase() === "MEDIUM")) {
                        priority = "MEDIUM";
                    } else if (priorityText === "3" || (priorityText && priorityText.toUpperCase() === "LOW")) {
                        priority = "LOW";
                    }

                    todos.push({
                        line: index + 1,
                        text: match[3],
                        fileName: path.basename(filePath),
                        priority,
                        priorityValue: priorityMap[priority]
                    });
                }
            });
        }

        function scanDirectory(directory) {
            fs.readdirSync(directory).forEach(file => {
                const fullPath = path.join(directory, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    scanDirectory(fullPath);
                } else if (fullPath.match(/\.(js|ts|tsx|py|java|cpp|go|html|css)$/)) {
                    scanFile(fullPath);
                }
            });
        }

        workspaceFolders.forEach(folder => {
            scanDirectory(folder.uri.fsPath);
        });

        todos.sort((a, b) => a.priorityValue - b.priorityValue);
        panel.webview.html = getWebviewContent(todos);
    }

    function openFileAtLine(fileName, line) {
        vscode.workspace.openTextDocument(fileName).then(document => {
            vscode.window.showTextDocument(document).then(editor => {
                let position = new vscode.Position(line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position));
            });
        });
    }

    function removeTodoFromFile(fileName, line) {
        const text = fs.readFileSync(fileName, 'utf8').split('\n');
        text.splice(line - 1, 1);
        fs.writeFileSync(fileName, text.join('\n'), 'utf8');
    }

    function getWebviewContent(todos) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>To-Do List</title>
                <style>
                    body {
                        font-family: 'Segoe UI', sans-serif;
                        background-color: #1e1e1e;
                        color: #d4d4d4;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: flex-start;
                        height: 100vh;
                        padding: 20px;
                        margin: 0;
                    }
                    h2 { 
                        text-align: center;
                        font-size: 28px;
                        font-weight: bold;
                        color: #9c27b0;
                        margin-bottom: 20px;
                    }
                    .container {
                        width: 60%;
                        max-width: 700px;
                        position: relative;
                    }
                    .filter-container {
                        position: relative; 
                        top: 10px;
                        left: 0;
                        background: #2c2c2c;
                        padding: 8px 14px;
                        border-radius: 6px;
                        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                        display: inline-block;
                    }
                    .filter-container label {
                        font-size: 15px;
                        margin-right: 8px;
                        color: #d4d4d4;
                    }
                    select {
                        padding: 6px;
                        font-size: 14px;
                        background: #333;
                        color: #d4d4d4;
                        border: 1px solid #6200ea;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    .todo-container {
                        width: 100%;
                        background: #252526;
                        padding: 18px;
                        border-radius: 10px;
                        box-shadow: 0 0 15px rgba(255, 255, 255, 0.1);
                        margin-top: 30px;
                    }
                    .todo-item {
                        padding: 10px;
                        margin: 6px 0;
                        border-radius: 5px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        font-size: 15px;
                        background: #333;
                        border-left: 5px solid;
                        transition: background 0.3s, transform 0.2s;
                    }
                    .todo-item:hover {
                        background: #444;
                        transform: scale(1.02);
                    }
                    .todo-item[data-priority="high"] { border-left-color: #ff5252; }
                    .todo-item[data-priority="medium"] { border-left-color: #ffb74d; }
                    .todo-item[data-priority="low"] { border-left-color: #66bb6a; }
                </style>
            </head>
            <body>
                <h2>To-Do List</h2>
                <div class="container">
                    <div class="filter-container">
                        <label for="priorityFilter">Filter: </label>
                        <select id="priorityFilter" onchange="filterTodos()">
                            <option value="all">All</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                    <div class="todo-container">
                        <div id="todoContainer">
                            ${todos.map(todo => `
                                <div class="todo-item" data-priority="${todo.priority.toLowerCase()}">
                                    <span><strong>${todo.priority}</strong> - <b>${todo.text}</b> (${todo.fileName}:${todo.line})</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <script>
                    function filterTodos() {
                        let filter = document.getElementById("priorityFilter").value;
                        let items = document.querySelectorAll(".todo-item");
                        items.forEach(item => {
                            item.style.display = (filter === "all" || item.dataset.priority === filter) ? "block" : "none";
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }
}

function deactivate() { }

module.exports = { activate, deactivate };
