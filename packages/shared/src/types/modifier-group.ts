export type ModifierGroup = {
    id: string;
    name: string;
    selectionType: "single" | "multiple";
    minSelect: number;
    maxSelect: number;
    isActive: boolean;
    modifierIds: string[];
    createdAt?: unknown;
    updatedAt?: unknown;
};