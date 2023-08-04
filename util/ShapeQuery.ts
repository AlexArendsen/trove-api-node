export const ShapeQuery = {

    // Listifies query args however they come in
    //   foo=1,2,3            => [1,2,3]
    //   foo=1&foo=2&foo=3    => [1,2,3]
    //   foo=1,2,3&foo=4,5,6  => [1,2,3,4,5,6]
    List: (query: qs.ParsedQs, key: string): string[] => {
        const val = query[key]
        if (Array.isArray(val)) {
            if (!val.length) return [];
            if (typeof val[0] === 'string') return val.flatMap(s => s.split(',')).filter(x => !!x);
            else return []
        }

        if (typeof val === 'string') return val.split(',').filter(x => !!x)
        return []
    },

    String: (query: qs.ParsedQs, key: string): string => {
        const val = query[key]
        return (typeof val === 'string') ? val : null;
    },

    Number: (query: qs.ParsedQs, key: string): number => {
        const val = query[key]
        return (typeof val === 'string') ? Number(val) : NaN;
    }
}

