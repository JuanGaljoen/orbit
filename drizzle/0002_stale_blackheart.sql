-- The single Mermaid diagram becomes an ordered list of views; an existing diagram is kept as one "map" view.
ALTER TABLE "projects" ALTER COLUMN "diagram" SET DATA TYPE jsonb USING CASE WHEN "diagram" IS NULL THEN NULL ELSE jsonb_build_array(jsonb_build_object('id', 'map', 'title', 'Architecture', 'mermaid', "diagram")) END;
