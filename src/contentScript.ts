async function startAnalyzer() {}

// Wait for DOM to be ready
if (
	document.readyState === "complete" ||
	document.readyState === "interactive"
) {
	startAnalyzer();
} else {
	document.addEventListener("DOMContentLoaded", startAnalyzer);
}
