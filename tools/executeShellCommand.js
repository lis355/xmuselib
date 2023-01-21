const { spawn } = require("child_process");

module.exports = async function executeShellCommand({ cmd, cwd, env = {}, onStdOutData, onStdErrData, onClose }) {
	return new Promise(resolve => {
		const options = {
			shell: true
		};

		options.env = app.libs._.assign({}, env);

		if (cwd) options.cwd = cwd;

		// const child = spawn(programm, args, options);
		const child = spawn(cmd, options);

		child.stdout.on("data", data => onStdOutData && onStdOutData(data));
		child.stderr.on("data", data => onStdErrData && onStdErrData(data));

		child.on("close", code => {
			onClose && onClose();

			return resolve(code);
		});
	});
};
