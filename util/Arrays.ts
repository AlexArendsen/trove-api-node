export const GroupBy = <TItem>(list: TItem[], keySelector: (item: TItem) => string): { [key: string]: TItem[] } => {

    const lookup: { [key: string]: TItem[] } = {}
    list.forEach(i => {
        const key = keySelector(i)
        if (!lookup[key]) lookup[key] = []
        lookup[key].push(i)
    })

    return lookup;

}

export const GroupByFirst = <TItem>(list: TItem[], keySelector: (item: TItem) => string): { [key: string]: TItem } => {

    const lookup: { [key: string]: TItem } = {}
    list.forEach(i => {
        const key = keySelector(i)
        if (!lookup[key]) lookup[key] = i
    })

    return lookup;
}