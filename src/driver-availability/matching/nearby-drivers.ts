const pickupLocations = new Map([
  ['west end', { lat: -27.4825, lon: 153.0105 }],
  ['south brisbane', { lat: -27.4743, lon: 153.0188 }],
  ['new farm', { lat: -27.4671, lon: 153.0485 }],
]);

export async function findNearbyDriverIds(
  baseUrl: string,
  pickupSuburb: string,
): Promise<ReadonlySet<string>> {
  const location = pickupLocations.get(pickupSuburb.trim().toLowerCase());
  if (!location) {
    throw new Error(`No demo coordinates for ${pickupSuburb}`);
  }

  const response = await fetch(new URL('/drivers/_search', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(1000),
    body: JSON.stringify({
      _source: false,
      query: {
        bool: {
          filter: {
            geo_distance: { distance: '2km', location },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch returned HTTP ${response.status}`);
  }

  const result = (await response.json()) as {
    hits: { hits: { _id: string }[] };
  };
  return new Set(result.hits.hits.map((hit) => hit._id));
}