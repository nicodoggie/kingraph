/** Graphviz attributes are open-ended; values are scalar DOT attributes. */
export type StyleProperties = Record<
    string,
    string | number | boolean | null | undefined
>;
export type Stylesheet = Record<string, StyleProperties>;

export interface Person {
    name?: string;
    display?: string;
    fullname?: string;
    first_name?: string;
    last_name?: string;
    gender?: string;
    born?: Date | string | number;
    died?: Date | string | number;
    created_at?: Date | string | number;
    picture?: string;
    links?: string[];
    class?: string[];
    comment?: string;
}

export interface Family {
    parents?: string[];
    parents2?: string[];
    children?: string[];
    children2?: string[];
    house?: string;
    links?: string[];
    families?: (Family | null)[];
}

export interface FamilyTree {
    families?: (Family | null)[];
    people?: Record<string, Person | null>;
    styles?: Stylesheet;
}
