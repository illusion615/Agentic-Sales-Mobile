public class Script : ScriptBase
{
    private const string StaticMapOperation = "GetStaticMap";
    private const string DrivingRouteOperation = "GetDrivingRoute";

    /** Keeps route geometry small enough to cross the native bridge comfortably. */
    private const int MaxPolylinePoints = 120;

    public override async Task<HttpResponseMessage> ExecuteAsync()
    {
        var operationId = this.ResolveOperationId(this.Context.OperationId);

        if (String.Equals(operationId, StaticMapOperation, StringComparison.Ordinal))
        {
            return await this.HandleStaticMapAsync().ConfigureAwait(false);
        }

        if (String.Equals(operationId, DrivingRouteOperation, StringComparison.Ordinal))
        {
            return await this.HandleDrivingRouteAsync().ConfigureAwait(false);
        }

        var unsupported = new HttpResponseMessage(HttpStatusCode.BadRequest);
        unsupported.Content = CreateJsonContent(new JObject
        {
            ["error"] = "Unsupported operation '" + operationId + "'",
        }.ToString());
        return unsupported;
    }

    private async Task<HttpResponseMessage> HandleStaticMapAsync()
    {
        var upstream = await this.Context
            .SendAsync(this.Context.Request, this.CancellationToken)
            .ConfigureAwait(false);

        if (!upstream.IsSuccessStatusCode)
        {
            return await ForwardErrorAsync(upstream).ConfigureAwait(false);
        }

        var bytes = await upstream.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
        var contentType = upstream.Content.Headers.ContentType == null
            ? "image/png"
            : upstream.Content.Headers.ContentType.MediaType;

        var response = new HttpResponseMessage(HttpStatusCode.OK);
        response.Content = CreateJsonContent(new JObject
        {
            ["imageBase64"] = Convert.ToBase64String(bytes),
            ["contentType"] = contentType,
            ["byteLength"] = bytes.Length,
        }.ToString());
        return response;
    }

    private async Task<HttpResponseMessage> HandleDrivingRouteAsync()
    {
        var upstream = await this.Context
            .SendAsync(this.Context.Request, this.CancellationToken)
            .ConfigureAwait(false);

        if (!upstream.IsSuccessStatusCode)
        {
            return await ForwardErrorAsync(upstream).ConfigureAwait(false);
        }

        var payload = await upstream.Content.ReadAsStringAsync().ConfigureAwait(false);
        var parsed = JObject.Parse(payload);

        if (!String.Equals((string)parsed["status"], "1", StringComparison.Ordinal))
        {
            return JsonError(HttpStatusCode.BadGateway, (string)parsed["info"] ?? "Route request rejected");
        }

        var route = parsed["route"];
        var paths = route == null ? null : route["paths"] as JArray;
        if (paths == null || paths.Count == 0)
        {
            return JsonError(HttpStatusCode.BadGateway, "Route response contained no path");
        }

        var path = paths[0];
        var points = new List<string>();
        var steps = path["steps"] as JArray;
        if (steps != null)
        {
            foreach (var step in steps)
            {
                var polyline = (string)step["polyline"];
                if (String.IsNullOrEmpty(polyline)) continue;

                foreach (var point in polyline.Split(';'))
                {
                    if (point.Length == 0) continue;
                    // Consecutive steps repeat the shared vertex.
                    if (points.Count > 0 && String.Equals(points[points.Count - 1], point, StringComparison.Ordinal)) continue;
                    points.Add(point);
                }
            }
        }

        var simplified = Simplify(points, MaxPolylinePoints);
        var response = new HttpResponseMessage(HttpStatusCode.OK);
        response.Content = CreateJsonContent(new JObject
        {
            ["distanceMetres"] = ParseInt(path["distance"]),
            ["durationSeconds"] = ParseInt(path["duration"]),
            ["trafficLights"] = ParseInt(path["traffic_lights"]),
            ["polyline"] = String.Join(";", simplified),
            ["pointCount"] = simplified.Count,
        }.ToString());
        return response;
    }

    private static List<string> Simplify(List<string> points, int maxPoints)
    {
        if (points.Count <= maxPoints) return points;

        var kept = new List<string>();
        var step = (double)(points.Count - 1) / (maxPoints - 1);
        for (var index = 0; index < maxPoints; index++)
        {
            kept.Add(points[(int)Math.Round(index * step)]);
        }
        // The exact endpoints must survive so the drawn route meets its stops.
        kept[kept.Count - 1] = points[points.Count - 1];
        return kept;
    }

    private static int ParseInt(JToken token)
    {
        int value;
        return Int32.TryParse((string)token, out value) ? value : 0;
    }

    private static HttpResponseMessage JsonError(HttpStatusCode status, string message)
    {
        var response = new HttpResponseMessage(status);
        response.Content = CreateJsonContent(new JObject
        {
            ["error"] = message,
        }.ToString());
        return response;
    }

    private static async Task<HttpResponseMessage> ForwardErrorAsync(HttpResponseMessage upstream)
    {
        var body = await upstream.Content.ReadAsStringAsync().ConfigureAwait(false);
        return JsonError(upstream.StatusCode, body);
    }

    private string ResolveOperationId(string value)
    {
        if (String.Equals(value, StaticMapOperation, StringComparison.Ordinal) ||
            String.Equals(value, DrivingRouteOperation, StringComparison.Ordinal))
        {
            return value;
        }

        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(value));
            return String.Equals(decoded, StaticMapOperation, StringComparison.Ordinal) ||
                   String.Equals(decoded, DrivingRouteOperation, StringComparison.Ordinal)
                ? decoded
                : value;
        }
        catch (FormatException)
        {
            return value;
        }
    }
}
