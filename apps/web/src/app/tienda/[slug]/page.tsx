import { getTenantBySlug } from "@/lib/firebase/queries/tenants";
import { getTenantCategories } from "@/lib/firebase/queries/categories";
import { getTenantProducts } from "@/lib/firebase/queries/products";

export default async function StorePage({ params }) {
 const tenant = await getTenantBySlug(params.slug);

 if (!tenant) return <div>Tienda no encontrada</div>;

 const categories = await getTenantCategories(tenant.id);
 const products = await getTenantProducts(tenant.id);

 return (
   <div>
     <h1>{tenant.name}</h1>

     <h2>Categorías</h2>
     {categories.map((c) => (
       <div key={c.id}>{c.name}</div>
     ))}

     <h2>Productos</h2>
     {products.map((p) => (
       <div key={p.id}>
         {p.name} - ${p.price}
       </div>
     ))}
   </div>
 );
}