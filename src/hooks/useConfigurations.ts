import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ConfigurationItem {
    id: string;
    label: string;
    text: string;
}

export interface Configurations {
    titles: string[];
    agencies: string[];
    serviceSnippets: { [key: string]: string };
    aboutUs: ConfigurationItem[];
    terms: ConfigurationItem[];
    deliverables: ConfigurationItem[];
    loading: boolean;
    error: string | null;
}

const DEFAULT_CONFIG: Configurations = {
    titles: [],
    agencies: [],
    serviceSnippets: {},
    aboutUs: [],
    terms: [],
    deliverables: [],
    loading: true,
    error: null,
};

export const useConfigurations = () => {
    const [configs, setConfigs] = useState<Configurations>(DEFAULT_CONFIG);

    useEffect(() => {
        const unsubscribes: (() => void)[] = [];
        const newConfigs: Partial<Configurations> = {};
        let loadedCount = 0;
        const totalCollections = 6;

        const handleUpdate = (key: keyof Configurations, data: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            newConfigs[key] = data as any;
            loadedCount++;

            // Only update state once we have initial data for everything to avoid jitter
            // Or update incrementally. Let's update incrementally but keep loading true until all 6 are in?
            // Simpler: Just update the specific key in state.
            setConfigs(prev => ({
                ...prev,
                [key]: data,
                loading: loadedCount < totalCollections
            }));
        };

        const handleError = (err: unknown) => {
            console.error("Error fetching configurations:", err);
            setConfigs(prev => ({ ...prev, error: "Failed to load configurations", loading: false }));
        };

        // 1. Titles
        unsubscribes.push(onSnapshot(doc(db, 'configurations', 'titles'), (doc) => {
            handleUpdate('titles', doc.data()?.items || []);
        }, handleError));

        // 2. Agencies
        unsubscribes.push(onSnapshot(doc(db, 'configurations', 'agencies'), (doc) => {
            handleUpdate('agencies', doc.data()?.items || []);
        }, handleError));

        // 3. Services
        unsubscribes.push(onSnapshot(doc(db, 'configurations', 'services'), (doc) => {
            handleUpdate('serviceSnippets', doc.data()?.items || {});
        }, handleError));

        // 4. About Us
        unsubscribes.push(onSnapshot(doc(db, 'configurations', 'about_us'), (doc) => {
            handleUpdate('aboutUs', doc.data()?.items || []);
        }, handleError));

        // 5. Terms
        unsubscribes.push(onSnapshot(doc(db, 'configurations', 'terms'), (doc) => {
            handleUpdate('terms', doc.data()?.items || []);
        }, handleError));

        // 6. Deliverables
        unsubscribes.push(onSnapshot(doc(db, 'configurations', 'deliverables'), (doc) => {
            handleUpdate('deliverables', doc.data()?.items || []);
        }, handleError));

        return () => {
            unsubscribes.forEach(unsub => unsub());
        };
    }, []);

    return configs;
};
