module.exports = class LocalDbManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		this.filePath = app.getUserDataPath("db.json");

		try {
			this.db = app.tools.json.load(this.filePath);
		} catch (error) {
			this.db = {};
		}
	}

	save() {
		app.tools.json.save(this.filePath, this.db);
	}
};
