import {Notice, requestUrl, TFile, normalizePath, App, moment} from "obsidian";
import { Client } from "@notionhq/client";
import { markdownToBlocks,  } from "@tryfabric/martian";
import * as yamlFrontMatter from "yaml-front-matter";
import * as yaml from "yaml"
import MyPlugin from "main";
export class Upload2Notion {
	app: MyPlugin;
	notion: Client;
	agent: any;
	constructor(app: MyPlugin) {
		this.app = app;
	}

	async deletePage(notionID:string){
		if (notionID){
		const response = await requestUrl({
			url: `https://api.notion.com/v1/blocks/${notionID}`,
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'Bearer ' + this.app.settings.notionAPI,
				'Notion-Version': '2022-02-22',
			},
			body: ''
		})
		return response;
		}
	}

	// 因为需要解析notion的block进行对比，非常的麻烦，
	// 暂时就直接删除，新建一个page


	async appendPage(pageId:string, childArr: any){
		const bodyString:any = {
			children: childArr,
		}
		if (pageId === undefined){
			return
		}
		try {
			const response = await requestUrl({
				url: `https://api.notion.com/v1/blocks/${pageId}/children`,
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					// 'User-Agent': 'obsidian.md',
					'Authorization': 'Bearer ' + this.app.settings.notionAPI,
					'Notion-Version': '2021-08-16',
				},
				body: JSON.stringify(bodyString),
			})
			return response;
		} catch (error) {
			new Notice(`network error ${error}`)
		}
	}

	async createPage(title:string, allowTags:boolean, tags:string[], childArr: any) {
		const bodyString:any = {
			parent: {
				database_id: this.app.settings.databaseID
			},
			properties: {
				Name: {
					title: [
						{
							text: {
								content: title,
							},
						},
					],
				},
				Tags: {
					multi_select: allowTags && tags !== undefined && tags!= null ? tags.map(tag => {
						return {"name": tag}
					}) : [],
				},
			},
			children: childArr,
		}

		if(this.app.settings.bannerUrl) {
			bodyString.cover = {
				type: "external",
				external: {
					url: this.app.settings.bannerUrl
				}
			}
		}

		try {
			const response = await requestUrl({
				url: `https://api.notion.com/v1/pages`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					// 'User-Agent': 'obsidian.md',
					'Authorization': 'Bearer ' + this.app.settings.notionAPI,
					'Notion-Version': '2021-08-16',
				},
				body: JSON.stringify(bodyString),
			})
			return response;
		} catch (error) {
				new Notice(`network error ${error}`)
		}
	}

	async syncMarkdownToNotion(title:string, allowTags:boolean, tags:string[], markdown: string,pageId:string): Promise<any> {
		let res:any
		const yamlObj:any = yamlFrontMatter.loadFront(markdown);
		const __content = yamlObj.__content
		const file2Block = markdownToBlocks(__content);
		// 如果是第一块chunk,就直接新增
		if( pageId){
			res = await this.appendPage(pageId,file2Block)
		}else{
			res = await this.createPage(title, allowTags, tags, file2Block);
		}
		return res

	}

	async updateYamlInfo(yamlContent: string, nowFile: TFile, res: any,app:App, settings:any) {
		const yamlObj:any = yamlFrontMatter.loadFront(yamlContent);
		let {url, id} = res.json
		// replace www to notionID
		const {notionID,allowNotionLink} = settings;
		if(notionID!=="") {
			// replace url str "www" to notionID
			url  = url.replace("www.notion.so", `${notionID}.notion.site`)
		}
		if (allowNotionLink){
			yamlObj.NotionLink = url;
		}
		yamlObj.LastSyncTime = moment().format('YYYY-MM-DD HH:mm:ss')
		try {
			await navigator.clipboard.writeText(url)
		} catch (error) {
			new Notice(`复制链接失败，请手动复制${error}`)
		}
		yamlObj.notionID = id;
		await this.updateYaml(yamlObj, nowFile)
	}


	async updateYaml(yamlObj:any, nowFile: TFile) {
		const __content = yamlObj.__content;
		delete yamlObj.__content
		const yamlhead = yaml.stringify(yamlObj)
		//  if yamlhead hava last \n  remove it
		const yamlhead_remove_n = yamlhead.replace(/\n$/, '')
		// if __content have start \n remove it
		const __content_remove_n = __content.replace(/^\n/, '')
		const content = '---\n' +yamlhead_remove_n +'\n---\n' + __content_remove_n;
		try {
			await nowFile.vault.modify(nowFile, content)
		} catch (error) {
			new Notice(`write file error ${error}`)
		}
	}




	 splitLongString(str: string) {
		if (str.length <= 4000) {
			return [str];
		}

		const chunks = [];
		let startIndex = 0;
		let endIndex = 4000;

		while (endIndex < str.length) {
			if (str[endIndex] !== '\n') {
				while (endIndex > startIndex && str[endIndex] !== '\n') {
					endIndex--;
				}
			}

			chunks.push(str.substring(startIndex, endIndex));
			startIndex = endIndex + 1;
			endIndex = startIndex + 4000;
		}

		chunks.push(str.substring(startIndex));

		return chunks;
	}


	generateUUID(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			const r = (Math.random() * 16) | 0,
				v = c === 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}

}
