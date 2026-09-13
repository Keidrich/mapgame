/**
 * The random button's pool: big, dense, well-mapped cities spread across every inhabited
 * continent, so '🎲' is a tour of the world rather than a tour of the United States.
 *
 * Each entry is the city's own pin. Nobody starts exactly on it — `sim/start.ts` moves a
 * city-level pick a few km into one corner of town first, so replaying a city is a new
 * neighbourhood rather than the same kerb.
 */
export interface CityPin { name: string; lat: number; lng: number }

export const BIG_CITIES: CityPin[] = [
  // North America
  { name: 'New York', lat: 40.7128, lng: -74.006 }, { name: 'Chicago', lat: 41.8781, lng: -87.6298 }, { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'New Orleans', lat: 29.9511, lng: -90.0715 }, { name: 'Montréal', lat: 45.5019, lng: -73.5674 }, { name: 'Toronto', lat: 43.6532, lng: -79.3832 },
  { name: 'Mexico City', lat: 19.4326, lng: -99.1332 }, { name: 'Havana', lat: 23.1136, lng: -82.3666 }, { name: 'Detroit', lat: 42.3314, lng: -83.0458 },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194 }, { name: 'Guatemala City', lat: 14.6349, lng: -90.5069 },
  // South America
  { name: 'São Paulo', lat: -23.5505, lng: -46.6333 }, { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 }, { name: 'Buenos Aires', lat: -34.6037, lng: -58.3816 },
  { name: 'Bogotá', lat: 4.711, lng: -74.0721 }, { name: 'Lima', lat: -12.0464, lng: -77.0428 }, { name: 'Santiago', lat: -33.4489, lng: -70.6693 },
  // Europe
  { name: 'London', lat: 51.5074, lng: -0.1278 }, { name: 'Berlin', lat: 52.52, lng: 13.405 }, { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'Naples', lat: 40.8518, lng: 14.2681 }, { name: 'Palermo', lat: 38.1157, lng: 13.3615 }, { name: 'Marseille', lat: 43.2965, lng: 5.3698 },
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 }, { name: 'Lisbon', lat: 38.7223, lng: -9.1393 }, { name: 'Dublin', lat: 53.3498, lng: -6.2603 },
  { name: 'Warsaw', lat: 52.2297, lng: 21.0122 }, { name: 'Prague', lat: 50.0755, lng: 14.4378 }, { name: 'Athens', lat: 37.9838, lng: 23.7275 },
  { name: 'Istanbul', lat: 41.0082, lng: 28.9784 }, { name: 'Amsterdam', lat: 52.3676, lng: 4.9041 }, { name: 'Belgrade', lat: 44.7866, lng: 20.4489 },
  // Africa
  { name: 'Lagos', lat: 6.5244, lng: 3.3792 }, { name: 'Cairo', lat: 30.0444, lng: 31.2357 }, { name: 'Johannesburg', lat: -26.2041, lng: 28.0473 },
  { name: 'Nairobi', lat: -1.2864, lng: 36.8172 }, { name: 'Casablanca', lat: 33.5731, lng: -7.5898 }, { name: 'Accra', lat: 5.6037, lng: -0.187 },
  { name: 'Addis Ababa', lat: 9.0192, lng: 38.7525 }, { name: 'Dakar', lat: 14.7167, lng: -17.4677 },
  // Asia
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 }, { name: 'Osaka', lat: 34.6937, lng: 135.5023 }, { name: 'Seoul', lat: 37.5665, lng: 126.978 },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694 }, { name: 'Shanghai', lat: 31.2304, lng: 121.4737 }, { name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  { name: 'Mumbai', lat: 19.076, lng: 72.8777 }, { name: 'Delhi', lat: 28.6139, lng: 77.209 }, { name: 'Karachi', lat: 24.8607, lng: 67.0011 },
  { name: 'Manila', lat: 14.5995, lng: 120.9842 }, { name: 'Jakarta', lat: -6.2088, lng: 106.8456 }, { name: 'Ho Chi Minh City', lat: 10.7769, lng: 106.7009 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 }, { name: 'Beirut', lat: 33.8938, lng: 35.5018 }, { name: 'Tbilisi', lat: 41.7151, lng: 44.8271 },
  { name: 'Tel Aviv', lat: 32.0853, lng: 34.7818 }, { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  // Oceania
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 }, { name: 'Melbourne', lat: -37.8136, lng: 144.9631 }, { name: 'Auckland', lat: -36.8485, lng: 174.7633 },
];
