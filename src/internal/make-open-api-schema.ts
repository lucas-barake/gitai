import type { JsonSchema7Object, JsonSchema7Root } from "effect/JSONSchema";
import { type Schema, SchemaAST, JSONSchema } from "effect";

const removeAdditionalProperties = (schema: unknown): unknown => {
  if (Array.isArray(schema)) {
    return schema.map(removeAdditionalProperties);
  }
  if (schema !== null && typeof schema === "object") {
    const newSchema = { ...(schema as object) };
    delete (newSchema as Partial<JsonSchema7Object>).additionalProperties;

    for (const key in newSchema) {
      (newSchema as any)[key] = removeAdditionalProperties((newSchema as any)[key]);
    }
    return newSchema;
  }
  return schema;
};

const isParseJsonTransformation = (ast: SchemaAST.AST): boolean =>
  ast.annotations[SchemaAST.SchemaIdAnnotationId] === SchemaAST.ParseJsonSchemaId;

export const makeOpenApiSchema = <A, I, R>(schema: Schema.Schema<A, I, R>): JsonSchema7Root => {
  const definitions: Record<string, any> = {};

  const ast =
    SchemaAST.isTransformation(schema.ast) && isParseJsonTransformation(schema.ast.from)
      ? schema.ast.to
      : schema.ast;

  const jsonSchema = JSONSchema.fromAST(ast, {
    definitions,
    target: "openApi3.1",
    topLevelReferenceStrategy: "skip",
  });

  return removeAdditionalProperties(jsonSchema) as JsonSchema7Root;
};
