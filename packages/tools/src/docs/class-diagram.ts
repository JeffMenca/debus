import ts from 'typescript';

export interface ClassSource {
  // Relative to the src folder of the service.
  path: string;
  text: string;
}

interface DrawnClass {
  name: string;
  folder: string | null;
  methods: string[];
  dependencies: string[];
  parent: string | null;
}

const DRAWN_DECORATORS = new Set(['Injectable', 'Controller', 'Catch']);
const LEFT_OUT_SUFFIX = /(Module|Dto|Exception|Error)$/;
const LIFECYCLE_METHODS = new Set([
  'onModuleInit',
  'onModuleDestroy',
  'onApplicationBootstrap',
  'onApplicationShutdown',
]);

const hasModifier = (node: ts.HasModifiers, kind: ts.SyntaxKind): boolean =>
  ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false;

function decoratorName(decorator: ts.Decorator): string {
  const { expression } = decorator;
  return ts.isCallExpression(expression) ? expression.expression.getText() : expression.getText();
}

function isDrawn(node: ts.ClassDeclaration): boolean {
  if (!node.name || !hasModifier(node, ts.SyntaxKind.ExportKeyword)) return false;
  if (LEFT_OUT_SUFFIX.test(node.name.text)) return false;
  if (hasModifier(node, ts.SyntaxKind.AbstractKeyword)) return true;
  return (ts.getDecorators(node) ?? []).some((decorator) =>
    DRAWN_DECORATORS.has(decoratorName(decorator)),
  );
}

function publicMethods(node: ts.ClassDeclaration): string[] {
  return node.members
    .filter(ts.isMethodDeclaration)
    .filter(
      (method) =>
        !hasModifier(method, ts.SyntaxKind.PrivateKeyword) &&
        !hasModifier(method, ts.SyntaxKind.ProtectedKeyword),
    )
    .map((method) => method.name.getText())
    .filter((name) => !LIFECYCLE_METHODS.has(name))
    .sort();
}

function constructorTypes(node: ts.ClassDeclaration): string[] {
  const constructor = node.members.find(ts.isConstructorDeclaration);
  return (constructor?.parameters ?? []).flatMap(({ type }) =>
    type && ts.isTypeReferenceNode(type) ? [type.typeName.getText()] : [],
  );
}

function parentOf(node: ts.ClassDeclaration): string | null {
  const clause = node.heritageClauses?.find(({ token }) => token === ts.SyntaxKind.ExtendsKeyword);
  const expression = clause?.types[0]?.expression;
  return expression && ts.isIdentifier(expression) ? expression.text : null;
}

function classesOf({ path, text }: ClassSource): DrawnClass[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const parts = path.split('/');
  const folder = parts.length > 1 ? parts[0]!.replace(/\W/g, '_') : null;
  return file.statements
    .filter(ts.isClassDeclaration)
    .filter(isDrawn)
    .map((node) => ({
      name: node.name!.text,
      folder,
      methods: publicMethods(node),
      dependencies: constructorTypes(node),
      parent: parentOf(node),
    }));
}

function classLines({ name, methods }: DrawnClass, indent: string): string[] {
  if (methods.length === 0) return [`${indent}class ${name}`];
  return [
    `${indent}class ${name} {`,
    ...methods.map((method) => `${indent}  +${method}()`),
    `${indent}}`,
  ];
}

// Only the syntax of each file is read, with no program or types: it is fast and always gives the
// same diagram, so the check of the CI is stable.
export function classDiagram(sources: readonly ClassSource[]): string {
  const classes = sources.flatMap(classesOf).sort((a, b) => a.name.localeCompare(b.name));
  const known = new Set(classes.map(({ name }) => name));
  const folders = [...new Set(classes.flatMap(({ folder }) => folder ?? []))].sort();

  const relations = classes.flatMap(({ name, dependencies, parent }) => [
    ...(parent && known.has(parent) ? [`  ${parent} <|-- ${name}`] : []),
    ...[...new Set(dependencies)]
      .filter((dependency) => known.has(dependency))
      .sort()
      .map((dependency) => `  ${name} --> ${dependency}`),
  ]);

  return [
    'classDiagram',
    ...classes.filter(({ folder }) => !folder).flatMap((drawn) => classLines(drawn, '  ')),
    ...folders.flatMap((folder) => [
      `  namespace ${folder} {`,
      ...classes
        .filter((drawn) => drawn.folder === folder)
        .flatMap((drawn) => classLines(drawn, '    ')),
      '  }',
    ]),
    ...relations,
  ].join('\n');
}
