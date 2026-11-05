declare module "file-saver" {
	export function saveAs(data: Blob | string, filename?: string, options?: { autoBom?: boolean }): void;
	const FileSaver: { saveAs: typeof saveAs };
	export default FileSaver;
}
