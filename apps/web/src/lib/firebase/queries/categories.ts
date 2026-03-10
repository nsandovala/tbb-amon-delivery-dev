import { db } from "../client";
import { collection, getDocs } from "firebase/firestore";

export async function getTenantCategories(tenantId: string) {
 const snap = await getDocs(
   collection(db, `tenants/${tenantId}/categories`)
 );

 return snap.docs.map((d) => ({
   id: d.id,
   ...d.data(),
 }));
}