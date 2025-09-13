export const ELDLogEngine = {
    formatDuration(mins: number) {
        const h = Math.floor(mins / 60);
        const m = Math.floor(mins % 60);
        return `${h}h ${m}m`;
    },
};
