export type TenantSettings = {
    cart: {
        enableAddons: boolean;
        showLikes: boolean;
        showRatings: boolean;
        floatingChatEnabled: boolean;
    };

    ordering: {
        minOrderAmount?: number;
        allowNotes: boolean;
        autoAcceptOrders?: boolean;
    };

    ui: {
        heroTitle?: string;
        heroSubtitle?: string;
        categoryChipsCenteredDesktop?: boolean;
    };
};