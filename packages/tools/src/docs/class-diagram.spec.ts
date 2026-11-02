import { classDiagram } from './class-diagram';

const service = `
@Injectable()
export class RouteService extends BaseService {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxService) { super(); }
  list(query: RouteQuery): Promise<Page> { return this.run(query); }
  private run(query: RouteQuery) { return query; }
  onModuleInit() {}
}`;
const controller = `
@Controller('routes')
export class RouteController {
  constructor(private readonly routes: RouteService) {}
  @Get() list() { return this.routes.list({}); }
}`;
const prisma = `@Injectable() export class PrismaService {}`;
const dto = `export class CreateRouteDto extends createZodDto(schema) {}`;
const mod = `@Module({}) export class RouteModule {}`;

describe('classDiagram', () => {
  const diagram = classDiagram([
    { path: 'routes/route.service.ts', text: service },
    { path: 'routes/route.controller.ts', text: controller },
    { path: 'prisma/prisma.service.ts', text: prisma },
    { path: 'routes/route.dto.ts', text: dto },
    { path: 'routes/route.module.ts', text: mod },
  ]);

  it('draws controllers and services with their public methods', () => {
    expect(diagram).toContain('classDiagram');
    expect(diagram).toContain('+list()');
    expect(diagram).not.toContain('run');
    expect(diagram).not.toContain('onModuleInit');
  });

  it('draws dependencies between known classes only', () => {
    expect(diagram).toContain('RouteController --> RouteService');
    expect(diagram).toContain('RouteService --> PrismaService');
    expect(diagram).not.toContain('OutboxService');
  });

  it('leaves out modules and DTOs', () => {
    expect(diagram).not.toContain('RouteModule');
    expect(diagram).not.toContain('CreateRouteDto');
  });

  it('groups classes by folder', () => {
    expect(diagram).toContain('namespace routes');
  });

  it('keeps a class of the root of src out of every folder', () => {
    const lines = classDiagram([
      { path: 'app.controller.ts', text: `@Controller() export class AppController {}` },
    ]).split('\n');

    expect(lines).toEqual(['classDiagram', '  class AppController']);
  });

  it('writes a folder with a hyphen as a name the diagram accepts', () => {
    expect(
      classDiagram([{ path: 'trip-copies/x.ts', text: `@Injectable() export class X {}` }]),
    ).toContain('namespace trip_copies {');
  });

  it('draws abstract classes, filters and who extends them', () => {
    const diagram = classDiagram([
      {
        path: 'a/base.ts',
        text: `export abstract class Base { protected hidden() {} shared() {} }`,
      },
      { path: 'a/child.ts', text: `@Injectable() export class Child extends Base {}` },
      { path: 'a/filter.ts', text: `@Catch() export class AllFilter { catch() {} }` },
      { path: 'a/plain.ts', text: `export class Plain {}` },
      { path: 'a/hidden.ts', text: `@Injectable() class NotExported {}` },
      { path: 'a/error.ts', text: `@Injectable() export class BadError {}` },
    ]);

    expect(diagram).toContain('Base <|-- Child');
    expect(diagram).toContain('+shared()');
    expect(diagram).not.toContain('hidden');
    expect(diagram).toContain('+catch()');
    expect(diagram).not.toContain('Plain');
    expect(diagram).not.toContain('NotExported');
    expect(diagram).not.toContain('BadError');
  });

  it('does not depend on the order of the files', () => {
    const files = [
      { path: 'routes/route.service.ts', text: service },
      { path: 'routes/route.controller.ts', text: controller },
      { path: 'prisma/prisma.service.ts', text: prisma },
    ];
    expect(classDiagram(files)).toBe(classDiagram([...files].reverse()));
  });
});
