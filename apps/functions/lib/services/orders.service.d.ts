import type { CreateOrderInput, UpdateOrderStatusInput } from "../schemas/order.shared";
export declare function handleCreateOrder(tenantId: string, input: CreateOrderInput): Promise<{
    orderId: string;
}>;
export declare function handleUpdateOrderStatus(tenantId: string, orderId: string, input: UpdateOrderStatusInput): Promise<void>;
export declare function handleGetOrder(tenantId: string, orderId: string): Promise<{
    id: string;
}>;
