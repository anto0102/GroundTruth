/**
 * @module registry
 * @description Mappa hardcodata dipendenza → URL docs ufficiale per bypass DDG su framework noti.
 */

// ─── Docs URL Registry ──────────────────────────────

const DOCS_REGISTRY = {
    'svelte': 'https://svelte.dev/docs/svelte/overview',
    'sveltekit': 'https://svelte.dev/docs/kit/introduction',
    'react': 'https://react.dev/reference/react',
    'react-dom': 'https://react.dev/reference/react-dom',
    'next': 'https://nextjs.org/docs',
    'nextjs': 'https://nextjs.org/docs',
    'vue': 'https://vuejs.org/api/',
    'nuxt': 'https://nuxt.com/docs/api',
    'angular': 'https://angular.dev/overview',
    'astro': 'https://docs.astro.build/en/reference/configuration-reference/',
    'tailwindcss': 'https://tailwindcss.com/docs',
    'typescript': 'https://www.typescriptlang.org/docs/',
    'express': 'https://expressjs.com/en/5x/api.html',
    'fastify': 'https://fastify.dev/docs/latest/',
    'hono': 'https://hono.dev/docs/',
    'solid-js': 'https://docs.solidjs.com/',
    'qwik': 'https://qwik.dev/docs/',
    'remix': 'https://remix.run/docs/en/main',
    'prisma': 'https://www.prisma.io/docs',
    'drizzle-orm': 'https://orm.drizzle.team/docs/overview',
    'three': 'https://threejs.org/docs/',
    'zod': 'https://zod.dev/',
    'trpc': 'https://trpc.io/docs',
    'tanstack-query': 'https://tanstack.com/query/latest/docs/overview',
};

/**
 * @description Normalizza nome dipendenza e cerca URL docs nel registry.
 * @param   {string} depName - Nome dipendenza da package.json (es. "svelte 5.51" o "@sveltejs/kit")
 * @returns {string|null} URL docs diretto o null se non trovato
 */
export function lookupRegistryUrl(depName) {
    // Prende solo il nome senza versione ("svelte 5.51" → "svelte")
    const name = depName.split(' ')[0].toLowerCase();

    // Match diretto
    if (DOCS_REGISTRY[name]) return DOCS_REGISTRY[name];

    // Strip @scope/ prefix ("@sveltejs/kit" → "kit", ma usiamo mapping speciali)
    if (name === '@sveltejs/kit') return DOCS_REGISTRY['sveltekit'];
    if (name === 'next' || name === '@next/core') return DOCS_REGISTRY['next'];

    // Generic scope strip
    const stripped = name.startsWith('@') ? name.split('/')[1] : name;
    if (DOCS_REGISTRY[stripped]) return DOCS_REGISTRY[stripped];

    // Strip -js suffix ("solid-js" → "solid")
    const noJs = stripped.replace(/-js$/, '');
    if (noJs !== stripped && DOCS_REGISTRY[noJs]) return DOCS_REGISTRY[noJs];

    return null;
}

export { DOCS_REGISTRY };
