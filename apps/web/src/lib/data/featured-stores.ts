export interface FeaturedStore {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  location: string;
  image: string;
  tags: string[];
  status: "open" | "closed" | "soon";
  metrics?: {
    rating?: number;
    orders?: string;
    deliveryTime?: string;
  };
  isActive: boolean;
}

export const featuredStores: FeaturedStore[] = [
  {
    id: "tbb-001",
    slug: "tbb",
    name: "The Best Burger",
    tagline: "Receta de la Abuela",
    description:
      "Burgers artesanales con la receta secreta que pasó de generación en generación. Ingredientes premium, sabor inolvidable.",
    location: "Valparaíso, Chile",
    image: "/images/stubs/burger-real.jpg",
    tags: ["Delivery", "Retiro", "Abierto"],
    status: "open",
    metrics: {
      rating: 4.9,
      orders: "2.4k",
      deliveryTime: "25-35 min",
    },
    isActive: true,
  },
  {
    id: "demo-002",
    slug: "demo-sushi",
    name: "Sushi Zen",
    tagline: "Arte en cada pieza",
    description:
      "Sushi premium preparado al momento. Rolls exclusivos, sashimi fresco y una experiencia gastronómica japonesa auténtica.",
    location: "Santiago, Chile",
    image: "/images/stubs/hero-bg.png",
    tags: ["Delivery", "Premium"],
    status: "soon",
    metrics: {
      deliveryTime: "30-45 min",
    },
    isActive: false,
  },
  {
    id: "demo-003",
    slug: "demo-pizza",
    name: "Forno Nero",
    tagline: "Masa madre, fuego real",
    description:
      "Pizzas napolitanas horneadas en horno de leña. Masa madre 72 horas, ingredientes importados de Italia.",
    location: "Viña del Mar, Chile",
    image: "/images/stubs/hero-bg.png",
    tags: ["Delivery", "Retiro"],
    status: "soon",
    metrics: {
      deliveryTime: "35-50 min",
    },
    isActive: false,
  },
  {
    id: "demo-004",
    slug: "minimarket",
    name: "Express Market",
    tagline: "Todo al alcance de tu mano",
    description:
      "Minimarket digital con lo esencial para tu día a día. Desde snacks y bebidas hasta productos de higiene, entregados en minutos.",
    location: "Valparaíso, Chile",
    image: "/images/stubs/hero-bg.png",
    tags: ["Delivery", "24/7"],
    status: "soon",
    metrics: {
      deliveryTime: "15-25 min",
    },
    isActive: false,
  },
  {
    id: "demo-005",
    slug: "foodtruck",
    name: "Street Bites",
    tagline: "Sabor callejero premium",
    description:
      "Foodtruck con las mejores recetas de la calle. Tacos, burgers smash y bowls que rotan por toda la ciudad.",
    location: "Valparaíso, Chile",
    image: "/images/stubs/hero-bg.png",
    tags: ["Delivery", "Retiro", "Street Food"],
    status: "soon",
    metrics: {
      deliveryTime: "20-30 min",
    },
    isActive: false,
  },
];
