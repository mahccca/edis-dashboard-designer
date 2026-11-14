import { useCallback, useEffect, useState } from "react";
import { http } from "../../shared/api/http";
import type {
  BindingValue, ComponentSpec, ComponentSummary, DataBinding, DataSource, IndustrialObject, ObjectType, PageSummary,
} from "../../shared/api/types";

export interface EditorCatalog {
  components: ComponentSpec[];
  bindings: DataBinding[];
  objects: IndustrialObject[];
  objectTypes: ObjectType[];
  dataSources: DataSource[];
  pages: PageSummary[];
}

const EMPTY: EditorCatalog = { components: [], bindings: [], objects: [], objectTypes: [], dataSources: [], pages: [] };

async function list<T>(path: string): Promise<T[]> {
  try {
    return (await http.get<{ items: T[] }>(path)).data.items;
  } catch {
    return [];
  }
}

/** Everything the editor needs to offer choices: usable component versions, bindings, objects and their types. */
export function useCatalog(projectId: string): [EditorCatalog, () => Promise<void>] {
  const [catalog, setCatalog] = useState<EditorCatalog>(EMPTY);

  const reload = useCallback(async () => {
    const [summaries, bindings, objects, objectTypes, dataSources, pages] = await Promise.all([
      list<ComponentSummary>(`/projects/${projectId}/components`),
      list<DataBinding>(`/projects/${projectId}/data-bindings`),
      list<IndustrialObject>(`/projects/${projectId}/objects`),
      list<ObjectType>(`/projects/${projectId}/object-types`),
      list<DataSource>(`/projects/${projectId}/data-sources`),
      list<PageSummary>(`/projects/${projectId}/pages`),
    ]);
    const components = await Promise.all(
      summaries.filter((s) => s.latestPublishedVersion)
        .map((s) => http.get<ComponentSpec>(`/components/${s.id}/versions/${s.latestPublishedVersion}`).then((r) => r.data)),
    );
    setCatalog({ components, bindings, objects, objectTypes, dataSources, pages });
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return [catalog, reload];
}

/** Current values of the bindings used on the canvas (polled; the studio preview never needs sub-second updates). */
export function useBindingValues(bindingIds: string[], intervalMs = 5000): Record<string, BindingValue> {
  const [values, setValues] = useState<Record<string, BindingValue>>({});
  const key = [...bindingIds].sort().join(",");

  useEffect(() => {
    if (!key) return;
    let stop = false;
    const tick = async () => {
      const results = await Promise.all(key.split(",").map((id) =>
        http.get<BindingValue>(`/data-bindings/${id}/value`).then((r) => r.data).catch(() => null)));
      if (!stop) setValues(Object.fromEntries(results.filter((v): v is BindingValue => v !== null).map((v) => [v.bindingId, v])));
    };
    void tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [key, intervalMs]);

  return values;
}
