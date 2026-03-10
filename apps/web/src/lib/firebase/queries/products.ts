import { db } from "../client";
import { collection, getDocs } from "firebase/firestore";

export async function getTenantProducts(tenantId: string) {
 const snap = await getDocs(
   collection(db, `tenants/${tenantId}/products`)
 );

 return snap.docs.map((d) => ({
   id: d.id,
   ...d.data(),
 }));
}