import elementReady, { type Options } from "element-ready";

export function $<T extends Element>(selector: string) {
	return document.querySelector<T>(selector);
}

export function $$<T extends Element>(selector: string) {
	return document.querySelectorAll<T>(selector);
}

export const waitForElement = async (selector: string, options?: Options) => {
	return elementReady(selector, {
		stopOnDomReady: false,
		...options,
	});
};

/**
 * Add CSS keyframes animation to document
 */
export function addKeyframesAnimation(name: string, keyframes: string): void {
	const existingStyle = document.getElementById(`keyframes-${name}`);
	if (existingStyle) return;

	const style = document.createElement("style");
	style.id = `keyframes-${name}`;
	style.textContent = `@keyframes ${name} { ${keyframes} }`;
	document.head.appendChild(style);
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	styles?: Partial<CSSStyleDeclaration>,
	attributes?: Record<string, string>,
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);

	if (styles) {
		Object.assign(element.style, styles);
	}

	if (attributes) {
		Object.entries(attributes).forEach(([key, value]) => {
			element.setAttribute(key, value);
		});
	}

	return element;
}
