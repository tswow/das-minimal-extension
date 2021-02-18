import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

class Function {
    name: string;
    args: Argument[] = [];
    is_export: boolean;
    line: number;
    file: string;
    comment: string;

    constructor(file: string, line: number, name: string, is_export: boolean, comment: string|undefined, args: Argument[]) {
        this.file = file;
        this.line = line;
        this.name = name;
        this.comment = comment || "";
        this.args = args;
        this.is_export = is_export;
    }

    make_markdown(): vscode.MarkdownString {
        let md = new vscode.MarkdownString();
        md.appendMarkdown(this.comment);
        md.appendCodeblock(`${this.name}(${this.args.map(x=>`${x.name}${x.type!=undefined?`: ${x.type.split(' ').join('')}`:''}`)})`)
        return md;
    }

    copy_require()
    {
        return new Function(this.file,this.line,this.name,false,this.comment,this.args);
    }
}

class Argument {
    name: string;
    type?: string;
    constructor(name: string, type?: string) {
        this.name = name;
        this.type = type;
    }
}

let files : {[key:string]:Function[]}= {}

export function parse_functions(doc: vscode.TextDocument, force: boolean = false)
{
    if(!force&&files[doc.uri.fsPath]!==undefined)
    {
        return files[doc.uri.fsPath];
    }
    return parse_functions_int(doc.uri.fsPath,doc.getText());
}

function parse_functions_int(fpath: string, doc: string)
{
    let next_export = false;
    let last_comment: string|undefined = undefined;
    let cur_comment: string|undefined  = undefined;

    let functions: {[key:string]: Function} = {}

    const lines = doc.split('\n')

    for(const i in lines) {
        let tx = lines[i];

        if(tx.trimLeft().trimRight().length==0) 
        {
            last_comment = undefined;
            continue;
        }
    
        if(tx.startsWith('require ')){
            let req = tx.substring(8)
            let curdir = path.dirname(fpath);
            let found = false;
            let fp = path.resolve(path.dirname(fpath),req);

            while(!found && curdir.length > 4) {
                fp = path.resolve(curdir,req);
                for(const full_path of [fp+'.das',fp+'.spec.das'])
                {
                    if(!fs.existsSync(full_path)) continue;
                    let nufuncs = (files[full_path]!==undefined?files[full_path] : 
                        parse_functions_int(full_path,fs.readFileSync(full_path).toString()))

                    for(const func of nufuncs) {
                        if(!functions[func.name]) functions[func.name] = func.copy_require();
                    }
                    found = true;
                    break;
                }
                curdir = path.dirname(curdir);
            }
            continue;
        }
    
        if(tx.includes('/*'))
        {
            cur_comment = "";
        }

        if(cur_comment!==undefined) {
            tx = tx.replace('/**','/*')
            let str = tx.replace('*/','')
            let sindex = str.indexOf('*');
            if(sindex>=0) 
            {
                str = tx.substring(sindex+1);
                let atmatch = str.match(/(@.+?) /);
                if(atmatch) str = '  \n'+str.replace(atmatch[1],`_${atmatch[1].trimLeft().trimRight()}_`)
                cur_comment+=str;
            }
        }

        if(tx.includes('*/'))
        {
            last_comment = cur_comment;
            cur_comment = undefined;
        }

        let func_match = tx.match(/def (.+?)\((.+?|)\)/);
        if(func_match) {
            const args = func_match[2].split(',').map(x=>{
                const types = x.split(':');
                return new Argument(types[0],types[1]);
            }).filter(x=>x.name.length>0);
            functions[func_match[1]] = (new Function(fpath,parseInt(i),func_match[1],next_export,last_comment,args));
        }

        if(tx.startsWith('[export]'))
        {
            next_export = true;
        }
        else
        {
            next_export = false;
        }
    };

    let func_list = Object.values(functions);
    files[fpath] = func_list;

    return func_list;
}