export type NomPlace = {
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    type?: string;
};

function formatLabel(p: NomPlace): string {
    return p.display_name;
}

export async function searchPlaces(query: string, limit = 8): Promise<Array<NomPlace & { label: string }>> {
    if (!query.trim()) return [];
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'ELD-Planner/1.0 (https://example.com)',
            'Referer': window.location.origin,
        },
    });
    if (!res.ok) {
        return [];
    }
    const data = (await res.json()) as NomPlace[];
    return data.map((p) => ({ ...p, label: formatLabel(p) }));
}
