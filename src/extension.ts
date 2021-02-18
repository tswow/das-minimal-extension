import * as vscode from 'vscode';
import { parse_functions } from './parse_file';

/**
 * [A-Z] [a-z] [0-9], [-] 
 */
function is_part_of_identifier(cc: number)
{
	if((cc>=48&&cc<=57) || (cc>=65&&cc<=90) || (cc>=97&&cc<=122) || cc==95)
	{
		return true;
	}	
	return false;
}

/**
 * Finds the identifier at a specific location
 */
function identifier_at(document: vscode.TextDocument, position: vscode.Position)
{
	let x = position.character;
	const line = document.lineAt(position.line).text;

	if(!is_part_of_identifier(line.charCodeAt(x))) return ""

	while(x>0 && is_part_of_identifier(line.charCodeAt(x-1)))
	{
		--x;
	}

	let ident = "";
	while(x<=line.length && is_part_of_identifier(line.charCodeAt(x))) {
		ident = ident + line.charAt(x);
		++x;
	}
	return ident;
}

export function activate(context: vscode.ExtensionContext) {
	vscode.languages.registerCompletionItemProvider('dascript',{
		provideCompletionItems(document: vscode.TextDocument,position: vscode.Position) {
			vscode.commands.executeCommand('editor.action.triggerParameterHints')

			let funcs = parse_functions(document);

			let func_completions = funcs.map(x=>{
				let item = new vscode.CompletionItem(x.name,vscode.CompletionItemKind.Function);
				item.documentation = x.make_markdown();
				return item;
			});

			// Maybe I can query it for identifiers since the editor clearly knows about them but idk

			let func_map : {[key:string]: boolean} = {}
			let ident_map : {[key:string]: boolean}= {}
			for(let func of funcs)
			{
				func_map[func.name] = true;
			}
			for(let i=0;i<document.lineCount;++i)
			{
				let line = document.lineAt(i).text;
				for(let c =0;c<line.length;++c)
				{
					let ident = identifier_at(document,new vscode.Position(i,c));
					if(ident.length>0 && !func_map[ident]){
						ident_map[ident] = true;
						c+=ident.length;
					}
				}
			}

			let keyword_completions = Object.keys(ident_map)
				.map(x=>new vscode.CompletionItem(x,vscode.CompletionItemKind.Text));
			return func_completions.concat(keyword_completions);
		}
	},".");
	
	vscode.languages.registerHoverProvider('dascript', {
		provideHover(document, position, token) {
			let ident = identifier_at(document,position);
			if(ident.length>0) {
				let parse = parse_functions(document);
				let fun = parse.find(x=>x.name==ident)
				if(fun) return new vscode.Hover(fun.make_markdown());
			}
		}
	});

	vscode.languages.registerDefinitionProvider('dascript',{
		provideDefinition(doc,pos,tok) {
			let ident = identifier_at(doc,pos);
			let funcs = parse_functions(doc);
			let func = funcs.find(x=>x.name==ident);
			if(func!==undefined) 
			{
				return new vscode.Location(vscode.Uri.file(func.file),new vscode.Position(func.line,0));
			}
			return undefined;
		}
	});

	vscode.window.onDidChangeTextEditorSelection((evt)=>{
		if(evt.textEditor.document.uri.toString().endsWith('.das')) {
			vscode.commands.executeCommand('editor.action.triggerParameterHints')
		}
	});

	vscode.workspace.onDidChangeTextDocument((e)=>{
		if(e.document.uri.toString().endsWith('.das')) {
			vscode.commands.executeCommand('editor.action.triggerParameterHints')
			parse_functions(e.document, true);
		}
	});

	vscode.languages.registerSignatureHelpProvider('dascript',{
		provideSignatureHelp(doc,pos,tok,ctx) {
			let sig = "";
			let closed = 0;
			const line = doc.lineAt(pos.line).text;
			
			for(let char = pos.character-1; char >= 0; --char)
			{
				let cc = line.charCodeAt(char);
				if(closed != -1 && cc==41) {++ closed; continue};
				if(closed != -1 && cc==40) {-- closed; continue;} ;

				if(closed==-1)
				{
					if(is_part_of_identifier(cc))
					{
						sig = String.fromCharCode(cc) + sig;
					}
					else
					{
						break;
					}
				}
			}

			if(sig.length>0)
			{
				let match = parse_functions(doc).find(x=>x.name==sig);
				if(match!==undefined) {
					let sighelp = new vscode.SignatureHelp();
					let siginfo = new vscode.SignatureInformation(match.name);
					siginfo.parameters = match.args.map(x=>new vscode.ParameterInformation(''));
					siginfo.label = match.name
					siginfo.documentation = match.make_markdown();
					sighelp.activeParameter = 0;
					sighelp.activeSignature = 0;
					sighelp.signatures.push(siginfo);
					return sighelp;
				}
			}
			return undefined;
		}
	});
}