/**
 * @module aliases
 * @description Mapping centralizzato package npm → nome canonico registry.
 */
export const PACKAGE_ALIASES = new Map([
    ['@sveltejs/kit', 'sveltekit'],
    // aggiungere qui nuovi alias
]);

export function resolveAlias(name) {
    return PACKAGE_ALIASES.get(name) ?? name;
}
