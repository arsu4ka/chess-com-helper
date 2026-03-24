export const storage = {
	set: async <T>(key: string, value: T) => {
		await chrome.storage.sync.set({ [key]: value });
		return value;
	},
	get: async <T = unknown>(key: string): Promise<T | undefined> => {
		const result = await chrome.storage.sync.get(key);
		return result[key] as T | undefined;
	},
	remove: async (key: string) => {
		await chrome.storage.sync.remove(key);
	},
};
