import { db } from "../client";
import { collection, query, where, getDocs } from "firebase/firestore";

export async function getTenantBySlug(slug: string) {
 const q = query(
   collection(db, "tenants"),
   where("slug", "==", slug)
 );

 const snap = await getDocs(q);

 if (snap.empty) return null;

 return { id: snap.docs[0].id, ...snap.docs[0].data() };
}