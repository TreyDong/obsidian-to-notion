import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	normalizePath, TAbstractFile, EventRef, CachedMetadata, TFile,moment
} from "obsidian";
import {addIcons} from 'icon';
import {Upload2Notion} from "Upload2Notion";
import {NoticeMConfig} from "Message";
import {CLIENT_RENEG_LIMIT} from "tls";

import * as yamlFrontMatter from "yaml-front-matter";


// Remember to rename these classes and interfaces!

interface PluginSettings {
	notionAPI: string;
	databaseID: string;
	bannerUrl: string;
	notionID: string;
	proxy: string;
	allowTags: boolean;
	allowNotionLink: boolean;
	folderPath: string;
	timer:string
}

const langConfig = NoticeMConfig(window.localStorage.getItem('language') || 'en')

const DEFAULT_SETTINGS: PluginSettings = {
	notionAPI: "",
	databaseID: "",
	bannerUrl: "",
	notionID: "",
	proxy: "",
	allowTags: false,
	allowNotionLink: false,
	folderPath: "",
	timer:""
};

interface FileObj {
	fileName: string;
	file: TFile;
	trigger: string;
	notionId: string
}

export default class ObsidianSyncNotionPlugin extends Plugin {
	settings: PluginSettings;
	
	count: number;

	
	needUpdateFileMap: Map<string, FileObj>;
	
	refArr:Array<EventRef>

	// registerEvent(eventRef: EventRef): void{
	//
	// }



	async onload() {
		await this.loadSettings();
		addIcons();
		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"notion-logo",
			"Share to notion",
			async (evt: MouseEvent) => {
				// Called when the user clicks the icon.
				this.upload(null);
			}
		);

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText("share to notion");

		this.addCommand({
			id: "share-to-notion",
			name: "share to notion",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				this.upload(null)
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
		this.count = 0
		this.needUpdateFileMap = new Map()
		// const triggerArr =['modify','delete','rename','create']
		this.refArr = []
		const folder = this.settings.folderPath
		const notion = new Upload2Notion(this)
		this.refArr.push( this.app.vault.on('modify',async (file: TFile) => {
			// this.autoUpload(file,triggerArr[i])
			if (file.parent.path === folder) {
				let id = app.metadataCache.getFileCache(file).frontmatter.id
				if (!id) {
					id = notion.generateUUID()
					const yamlObj: any = yamlFrontMatter.loadFront(await app.vault.read(file));
					yamlObj.id = id
					await notion.updateYaml(yamlObj, file)
				}
				const notionID = app.metadataCache.getFileCache(file).frontmatter.notionID
				if (notionID) {
					id = notionID
				}
				const fileObj: FileObj = {
					fileName: file.name,
					file: file,
					trigger: "modify",
					notionId: id
				}
				this.needUpdateFileMap.set(id, fileObj)

			}
		}))
		this.refArr.push( this.app.metadataCache.on('deleted',(file: TFile)=>{
			// this.autoUpload(file,triggerArr[i])
			console.log(file)
			if (file.parent.path === folder){
				const notionID = app.metadataCache.getFileCache(file).frontmatter.notionID

				if(notionID){
					const fileObj :FileObj = {
						fileName: file.name,
						file: file,
						trigger: "delete",
						notionId:notionID
					}
					this.needUpdateFileMap.set(notionID,fileObj)
				}

			}
		}))
		this.refArr.push( this.app.vault.on('rename',async (file: TFile) => {
			// this.autoUpload(file,triggerArr[i])
			if (file.parent.path === folder) {
				let id = app.metadataCache.getFileCache(file).frontmatter.id
				if (!id) {
					const id = notion.generateUUID()
					const yamlObj: any = yamlFrontMatter.loadFront(await app.vault.read(file));
					yamlObj.id = id
					await notion.updateYaml(yamlObj, file)
				}
				const notionID = app.metadataCache.getFileCache(file).frontmatter.notionID
				if (notionID) {
					id = notionID
				}
				const fileObj: FileObj = {
					fileName: file.name,
					file: file,
					trigger: "rename",
					notionId: id
				}
				this.needUpdateFileMap.set(id, fileObj)

			}
		}))
		this.refArr.push( this.app.vault.on('create',async (file: TFile) => {
			if (file.parent.path === folder) {
				const id = notion.generateUUID()
				const yamlObj: any = yamlFrontMatter.loadFront(await app.vault.read(file));
				yamlObj.id = id
				await notion.updateYaml(yamlObj, file)
				// const frontmatter = app.metadataCache.getFileCache(file).frontmatter
				// let notionID = 'create'+this.count
				// if (frontmatter){
				// 	if( frontmatter.notionID){
				// 		notionID = frontmatter.notionID
				// 	}
				// }
				const fileObj: FileObj = {
					fileName: file.name,
					file: file,
					trigger: "create",
					notionId: id
				}
				this.needUpdateFileMap.set(id, fileObj)
				this.count++
			}
		}))
		for (let refArrKey in this.refArr) {
			this.registerEvent(refArrKey)
		}


		const timer = Number(this.settings.timer)
		this.registerInterval(	window.setInterval(() =>{
			this.autoUpload(this.needUpdateFileMap)
			this.needUpdateFileMap.clear()
		},1000*timer))
	}

	autoUpload(fileMap:Map<string, FileObj>){

		fileMap.forEach((value, key, map) =>{
			let trigger = value.trigger
			let file = value.file
			if(trigger){
				if(trigger === 'delete'){
					const notion =new  Upload2Notion(this);
					notion.deletePage(key).then(r => {
						new Notice('delete Notion success')
					})
				}else{
						this.upload(file).then(()=>{
							new Notice('sync Notion success')
						})
				}
		}
		})
		return
	}

	async upload(file: TFile) {
		const {notionAPI, databaseID, allowTags} = this.settings;
		if (notionAPI === "" || databaseID === "") {
			new Notice(
				"Please set up the notion API and database ID in the settings tab."
			);
			return;
		}
		const upload = new Upload2Notion(this);
		const {markDownData, nowFile, tags} = await this.getNowFileMarkdownContent(this.app,file);

		const frontmasster = app.metadataCache.getFileCache(nowFile)?.frontmatter
		const notionID = frontmasster ? frontmasster.notionID : null
		let chunks = upload.splitLongString(markDownData)
		// 存在就先删除

		try {
			if (notionID) {
					await upload.deletePage(notionID)
			}
			if (chunks) {
				const {basename} = nowFile;
				// create page
				const res = await upload.syncMarkdownToNotion(basename, allowTags, tags, chunks[0], null)
				let {id} = res.json
				// append page
				for (let i = 1; i < chunks.length; i++) {
					const response = await upload.syncMarkdownToNotion(basename, allowTags, tags, chunks[i], id)
					if (response.status != 200) {
						new Notice(`${langConfig["sync-fail"]}${basename},please retry!`, 5000)
						break
					}
				}
				await upload.updateYamlInfo(markDownData, nowFile, res, app, this.settings)
				new Notice(`${langConfig["sync-success"]}${basename}`)

			} else {
				new Notice('sync-fail,please check your file in obsidian')
			}
		} catch (Exception) {
			console.log(Exception)
			new Notice('sync-fail,please retry')
		}
	}

	async getNowFileMarkdownContent(app: App,file: TFile) {
		const nowFile = file === null ? app.workspace.getActiveFile():file;
		const {allowTags} = this.settings;
		let tags = []
		try {
			if (allowTags) {
				tags = app.metadataCache.getFileCache(nowFile).frontmatter.tags;
			}
		} catch (error) {
			new Notice(langConfig["set-tags-fail"]);
		}

		if (nowFile) {
			let markDownData = await nowFile.vault.read(nowFile);
			const upload = new Upload2Notion(this);
			return {
				markDownData,
				nowFile,
				tags
			};
		} else {
			new Notice(langConfig["open-file"]);
			return;
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: ObsidianSyncNotionPlugin;

	constructor(app: App, plugin: ObsidianSyncNotionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl("h1", {
			text: "Public Settings",
		});


		new Setting(containerEl)
			.setName("Notion API Token")
			.setDesc("It's a secret")
			.addText((text) => {
				let t = text
					.setPlaceholder("Enter your Notion API Token")
					.setValue(this.plugin.settings.notionAPI)
					.onChange(async (value) => {
						this.plugin.settings.notionAPI = value;
						await this.plugin.saveSettings();
					})
				// t.inputEl.type = 'password'
				return t
			});

		new Setting(containerEl)
			.setName("Notion ID(optional)")
			.setDesc("Your notion ID(optional),share link likes:https://username.notion.site/,your notion id is [username]")
			.addText((text) =>
				text
					.setPlaceholder("Enter notion ID(options) ")
					.setValue(this.plugin.settings.notionID)
					.onChange(async (value) => {
						this.plugin.settings.notionID = value;
						await this.plugin.saveSettings();
					})
			);


		containerEl.createEl("h1", {
			text: "Settings for Obsidian to Notion plugin",
		});


		const notionDatabaseID = new Setting(containerEl)
			.setName("Database ID")
			.setDesc("It's a secret")
			.addText((text) => {
					let t = text
						.setPlaceholder("Enter your Database ID")
						.setValue(this.plugin.settings.databaseID)
						.onChange(async (value) => {
							this.plugin.settings.databaseID = value;
							await this.plugin.saveSettings();
						})
					// t.inputEl.type = 'password'
					return t
				}
			);

		// notionDatabaseID.controlEl.querySelector('input').type='password'

		new Setting(containerEl)
			.setName("Banner url(optional)")
			.setDesc("page banner url(optional), default is empty, if you want to show a banner, please enter the url(like:https://raw.githubusercontent.com/EasyChris/obsidian-to-notion/ae7a9ac6cf427f3ca338a409ce6967ced9506f12/doc/2.png)")
			.addText((text) =>
				text
					.setPlaceholder("Enter banner pic url: ")
					.setValue(this.plugin.settings.bannerUrl)
					.onChange(async (value) => {
						this.plugin.settings.bannerUrl = value;
						await this.plugin.saveSettings();
					})
			);


		new Setting(containerEl)
			.setName("Convert tags(optional)")
			.setDesc("Transfer the Obsidian tags to the Notion table. It requires the column with the name 'Tags'")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allowTags)
					.onChange(async (value) => {
						this.plugin.settings.allowTags = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Insert Notion Link to YAML")
			.setDesc("When complete share,it will add NotionLink to YAML")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allowNotionLink)
					.onChange(async (value) => {
						this.plugin.settings.allowNotionLink = value;
						await this.plugin.saveSettings();
					}))

		new Setting(containerEl)
			.setName("Auto shared folder path")
			.setDesc("The file under this path,will auto shared to Notion")
			.addText((text) =>
				text.setValue(this.plugin.settings.folderPath)
					.onChange(async (value) => {
						this.plugin.settings.folderPath = value;
						await this.plugin.saveSettings();
					}))

		new Setting(containerEl)
			.setName("Auto sync Time")
			.setDesc("how much minutes sync")
			.addText((cb) => {
				cb.setValue(this.plugin.settings.timer)
					.onChange(async (value) => {
						this.plugin.settings.timer = value;
						await this.plugin.saveSettings();
					})
			})




	}

}
