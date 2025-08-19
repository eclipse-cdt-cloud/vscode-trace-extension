# Developing a new view type

This guide will describe the mandatory and optional steps necessary to implement a new view type for the VSCode Trace Viewer. It covers the full development stack, including the Trace Compass trace server, the Trace Server Protocol (TSP) and impacted libraries used by the VSCode Trace Viewer.

## Data Provider

If the new view is to be populated using a data model that is not already available from the trace server, then a new data provider will need to be implemented.

The data provider's role is to provide a model corresponding to the requested method and parameters. This can commonly be achieved by scheduling an analysis and querying its resulting output. But it can also be achieved by any other method to extract data from the trace and compute an appropriate result.

## Data Provider Factory / Descriptor

To be visible to the VSCode Trace Viewer client, the new view should be declared using the org.eclipse.tracecompass.tmf.core.dataprovider extension point.

```xml
<extension point="org.eclipse.tracecompass.tmf.core.dataprovider">
    <dataProviderFactory
        class="org.foo.FooFactory"
        id="org.foo.factory.id">
    </dataProviderFactory>
</extension>
```

The factory class will return the list of data provider descriptors that can be created from this factory. This will correspond to output descriptors sent to the client over TSP which will be used to populate the available Views panel.

The output descriptor information includes the name and description shown to the user, the id to be used when the output is selected to be opened, and the provider type.

The factory class is also responsible to instantiate the requested data provider for a given trace. The data provider manager will request an instance from the factory and keep track of all created data providers per id for each opened trace.

```java
public class FooFactory implements IDataProviderFactory {
    @Override
    public Collection<IDataProviderDescriptor> getDescriptors(@NonNull ITmfTrace trace) {
        return Collections.singletonList(new DataProviderDescriptor.Builder()
            .setId("org.foo.dataprovider.id")
            .setName("Foo View")
            .setDescription("Foo output description")
            .setProviderType(ProviderType.FOO)
            .build()
        );
    }

    @Override
    public @Nullable ITmfTreeDataProvider<? extends ITmfTreeDataModel> createProvider(@NonNull ITmfTrace trace) {
        if (trace instanceof TmfExperiment) {
            return TmfTimeGraphCompositeDataProvider.create(TmfTraceManager.getTraceSet(trace), "org.foo.dataprovider.id");
        }
        FooAnalysisModule module = TmfTraceUtils.getAnalysisModuleOfClass(trace, FooAnalysisModule.class, "org.foo.analysis.id");
        if (module != null) {
            module.schedule();
            return new FooDataProvider(trace, module);
        }
        return null;
    }
}
```

## Provider Type

The provider type is an indication to the client, through the output descriptor, of which kind of output component to display in the viewer and which TSP endpoint(s) should be used to populate the output contents.

If a new type of provider is being created, an additional value should be added to the provider type enum, and the client should be updated to support a new output type value.

* in Trace Compass: IDataProviderDescriptor
* in TSP: DataProvider
* in tsp-typescript-client: ProviderType
* in react-components: TraceContextComponent

## TSP End Point

If a new provider type requires one or more new TSP end points, these can be declared in the trace-server class DataProviderService.

The end point path can be associated with the method responsible to compute and return the response.

The DataProviderService method should extract and validate the required parameters from the end point path and/or the request query parameters. It will get or create the appropriate data provider instance from the data provider manager. Using the specific data provider interface, it will invoke the data provider to query for a data model, then include and adapt if necessary that model in the TSP response for the queried end point.

## TSP Definition

The definition of a TSP end point is declared with Swagger annotations in the trace-server class DataProviderService. Annotations define the end point path, tag, possible successful and error responses, query parameters and response model.

The corresponding query parameters and response model are declared in various Swagger-annotated interfaces in the org.eclipse.tracecompass.incubator.internal.trace.server.jersey.rest.core.model java package.

These Swagger annotations are used to generate the API.yaml file that appears in the TSP documentation.

```java
@Path("/experiments/{expUUID}/outputs")
public class DataProviderService {
```

```java
@POST
@Path("/Foo/{outputId}/foo")
@Tag(name = "Foo")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@Operation(summary = "API to get the Foo model", description = "Foo description.", responses = {
    @ApiResponse(responseCode = "200", description = "Return the queried Foo", content = @Content(schema = @Schema(implementation = FooResponse.class))),
    @ApiResponse(responseCode = "400", description = "Error description", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
})

public Response getFoo(
    @Parameter(description = "exp UUID") @PathParam("expUUID") UUID expUUID,
    @Parameter(description = "output ID") @PathParam("outputId") String outputId,
    @RequestBody(description = "Query parameters to fetch the Foo model",
            content = { @Content(examples = @ExampleObject("{\"parameters\":{ \"key\": \"value\" }}"),
            schema = @Schema(implementation = FooQueryParameters.class)) },
            required = true)
        QueryParameters queryParameters) {
```

## TSP Typescript Client

The TSP Typescript client provides the API interfaces that can be used by client UI components to invoke TSP endpoints and obtain the response. If new TSP end points are added, corresponding interface methods should be defined in tsp-client.ts, with method implementations in http-tsp-client.ts.

```typescript
fetchFoo(
    expUUID: string,
    outputID: string,
    parameters: Query
): Promise<TspClientResponse<GenericResponse<FooModel>>>;
```

```typescript
public async fetchFoo(
    expUUID: string,
    outputID: string,
    parameters: Query
): Promise<TspClientResponse<GenericResponse<FooModel>>> {
    const url = this.baseUrl + "/experiments/" + expUUID + "/outputs/Foo/" + outputID + "/foo";
    return RestClient.post(url, parameters, GenericResponse(FooModel));
}
```

## Output Component

The implementation of a new view is realized by creating a new output component in the react-components library. The new output component should extend the base class AbstractOutputComponent.

The component is meant to be added to the main output container that is part of the trace viewer panel.

The important properties in the React props received at construction include:

* the trace id of the trace to which this component is associated
* the output descriptor corresponding to this output, including its id
* the TSP client to be used to populate the component contents
* the unit controller for the trace viewer panel, with the global synchronized window range and selection range

The model for the contents of the output component is usually fetched in an asynchronous method triggered by componentDidMount().

If necessary (e.g. while analysis is running in the trace-server), this is repeated in a loop until the result from the server indicates that the model is complete.

When the model is fetched, it is stored in the component state, which triggers a render of the component.

The UI contents of the components are created in the implementation of method renderMainArea(). The model stored in the state can be used to populate the contents.

If the component consists of a left tree and a right chart, then extending AbstractTreeOutputComponent will require instead implementation  of the three methods renderTree(), renderYAxis() and renderChart().

## Trace Context Component

The trace context component's render methods are responsible to create the correct type of output component based on the ProviderType of the opened output descriptor. It initializes the component common props and adds specific props depending on the output component.

It also separates outputs between common time scale charts and non-time scale charts. The code below in renderOutputs() may need to be updated if the new view type is to be grouped with the time scale charts:

```javascript
} else if (output.type === 'TIME_GRAPH' || output.type === 'TREE_TIME_XY') {
    timeScaleCharts.push(output);
} else {
    nonTimeScaleCharts.push(output);
}
```

If a new ProviderType is created, the trace context component renderGridLayout() method needs to be updated to support the new type.

```javascript
case ProviderType.FOO:
    return (
        <FooOutputComponent
            key={output.id}
            {...outputProps}
            className={this.state.pinnedView?.id === output.id ? 'pinned-view-shadow' : ''}
        />
    );
```

