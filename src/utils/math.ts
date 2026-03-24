export const clamp = (value: number, min: number, max: number) => {
	return Math.min(Math.max(value, min), max);
};

export const toInteger = (value: unknown, fallback: number) => {
	if (typeof value !== "number" || Number.isNaN(value)) return fallback;
	return Math.trunc(value);
};

export const parseInteger = (value: string | undefined) => {
	if (!value) return null;

	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
};
